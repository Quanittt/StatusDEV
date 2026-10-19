import type { AddMemberInput } from "@statusdev/shared";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatMessages, projectMembers, projects, user } from "../db/schema.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../errors.js";

export type ChatRole = "owner" | "pm" | "junior";

// Єдине місце, де визначено, хто з ким може листуватись.
// Owner і junior ніколи не спілкуються напряму: між ними завжди PM.
export function canChat(a: ChatRole, b: ChatRole): boolean {
  const pair = [a, b].sort().join("+");
  return pair === "owner+pm" || pair === "junior+pm";
}

// null означає «не учасник проєкту», і для API це те саме, що проєкту не існує.
export async function getRole(
  projectId: string,
  userId: string,
): Promise<ChatRole | null> {
  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;
  if (project.ownerId === userId) return "owner";
  const [member] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
  return member?.role ?? null;
}

async function requireRole(projectId: string, userId: string) {
  const role = await getRole(projectId, userId);
  if (!role) throw new NotFoundError("Проєкт не знайдено");
  return role;
}

async function requireOwnerRole(projectId: string, userId: string) {
  const role = await requireRole(projectId, userId);
  if (role !== "owner") throw new ForbiddenError("Лише власник керує командою");
}

export async function listMembers(projectId: string, userId: string) {
  const role = await requireRole(projectId, userId);
  if (role === "junior") throw new ForbiddenError();
  return db
    .select({
      userId: projectMembers.userId,
      name: user.name,
      email: user.email,
      role: projectMembers.role,
      createdAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));
}

export async function addMember(
  projectId: string,
  ownerId: string,
  input: AddMemberInput,
) {
  await requireOwnerRole(projectId, ownerId);

  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, input.email));
  if (!target) throw new NotFoundError("Користувача з таким email не знайдено");
  if (target.id === ownerId) {
    throw new BadRequestError("Власник вже є в проєкті");
  }

  // Унікальність гарантує первинний ключ, а не попередня перевірка.
  const [created] = await db
    .insert(projectMembers)
    .values({ projectId, userId: target.id, role: input.role })
    .onConflictDoNothing()
    .returning();
  if (!created) throw new ConflictError("Користувач вже в проєкті");
  return created;
}

export async function removeMember(
  projectId: string,
  ownerId: string,
  memberId: string,
) {
  await requireOwnerRole(projectId, ownerId);
  const removed = await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, memberId),
      ),
    )
    .returning({ userId: projectMembers.userId });
  if (removed.length === 0) throw new NotFoundError("Учасника не знайдено");
}

// З ким я можу листуватись у цьому проєкті.
export async function listContacts(projectId: string, userId: string) {
  const myRole = await requireRole(projectId, userId);

  const [owner] = await db
    .select({ userId: projects.ownerId, name: user.name })
    .from(projects)
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(eq(projects.id, projectId));

  const members = await db
    .select({
      userId: projectMembers.userId,
      name: user.name,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));

  const everyone: { userId: string; name: string; role: ChatRole }[] = [
    { ...owner!, role: "owner" },
    ...members,
  ];
  return everyone.filter((p) => p.userId !== userId && canChat(myRole, p.role));
}

// Перевіряє, що обидва в проєкті і що така пара взагалі може листуватись.
async function requireChatPair(projectId: string, me: string, otherId: string) {
  const myRole = await requireRole(projectId, me);
  if (otherId === me) throw new BadRequestError("Не можна писати собі");
  const otherRole = await getRole(projectId, otherId);
  if (!otherRole) throw new NotFoundError("Співрозмовника не знайдено");
  if (!canChat(myRole, otherRole)) {
    throw new ForbiddenError("З цією роллю чат заборонено");
  }
}

const betweenPair = (projectId: string, a: string, b: string) =>
  and(
    eq(chatMessages.projectId, projectId),
    or(
      and(eq(chatMessages.senderId, a), eq(chatMessages.recipientId, b)),
      and(eq(chatMessages.senderId, b), eq(chatMessages.recipientId, a)),
    ),
  );

// Без `after` повертає останні `limit` повідомлень; з `after` (id останнього відомого) лише новіші.
export async function listMessages(
  projectId: string,
  me: string,
  otherId: string,
  { after, limit }: { after?: string; limit: number },
) {
  await requireChatPair(projectId, me, otherId);
  const pair = betweenPair(projectId, me, otherId);

  if (!after) {
    const latest = await db
      .select()
      .from(chatMessages)
      .where(pair)
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return latest.reverse();
  }

  const [anchor] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(pair, eq(chatMessages.id, after)));
  if (!anchor) throw new NotFoundError("Повідомлення не знайдено");
  // Порівняння в SQL: JS-дата має мс, а Postgres мкс, і через це «останнє відоме» повернулось би знову.
  return db
    .select()
    .from(chatMessages)
    .where(
      and(
        pair,
        sql`${chatMessages.createdAt} > (select created_at from chat_messages where id = ${after})`,
      ),
    )
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
}

export async function sendMessage(
  projectId: string,
  me: string,
  otherId: string,
  body: string,
) {
  await requireChatPair(projectId, me, otherId);
  const [created] = await db
    .insert(chatMessages)
    // Відправник завжди з сесії, ніколи з тіла запиту.
    .values({ projectId, senderId: me, recipientId: otherId, body })
    .returning();
  return created;
}
