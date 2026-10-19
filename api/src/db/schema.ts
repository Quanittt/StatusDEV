import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  primaryKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

export * from "./auth-schema.js";

export const projectStatus = pgEnum("project_status", [
  "active",
  "paused",
  "done",
  "archived",
]);

export const milestoneStatus = pgEnum("milestone_status", [
  "todo",
  "in_progress",
  "done",
]);

export const milestoneClientResponse = pgEnum("milestone_client_response", [
  "approved",
  "changes_requested",
]);

export const commentAuthorType = pgEnum("comment_author_type", [
  "owner",
  "client",
]);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("clients_owner_id_idx").on(t.ownerId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: projectStatus("status").default("active").notNull(),
    deadline: timestamp("deadline"),
    // Секретний токен посилання для клієнта (портал без акаунта). null = посилання вимкнено.
    shareToken: text("share_token").unique(),
    // Необов'язковий захист посилання: після shareExpiresAt портал віддає 410, пароль перевіряється при вході.
    shareExpiresAt: timestamp("share_expires_at"),
    sharePasswordHash: text("share_password_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("projects_owner_id_idx").on(t.ownerId),
    index("projects_client_id_idx").on(t.clientId),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: milestoneStatus("status").default("todo").notNull(),
    position: integer("position").notNull(),
    dueDate: timestamp("due_date"),
    clientAction: text("client_action"),
    completedAt: timestamp("completed_at"),
    // Відповідь клієнта з порталу. Скидається, коли власник змінює статус або «що потрібно від клієнта».
    clientResponse: milestoneClientResponse("client_response"),
    clientResponseNote: text("client_response_note"),
    clientRespondedAt: timestamp("client_responded_at"),
    // Коли надіслано нагадування про дедлайн. Скидається при зміні due_date.
    soonRemindedAt: timestamp("soon_reminded_at"),
    overdueRemindedAt: timestamp("overdue_reminded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("milestones_project_id_position_idx").on(t.projectId, t.position)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "cascade",
    }),
    authorType: commentAuthorType("author_type").default("owner").notNull(),
    // null для коментарів клієнта з порталу: у клієнта немає облікового запису.
    authorId: text("author_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("comments_project_id_idx").on(t.projectId),
    index("comments_milestone_id_idx").on(t.milestoneId),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("files_project_id_idx").on(t.projectId),
    index("files_milestone_id_idx").on(t.milestoneId),
  ],
);

export const documentStatus = pgEnum("document_status", [
  "pending",
  "approved",
  "changes_requested",
]);

// Запит на погодження файлу проєкту (договір, ТЗ). Клієнт «підписує» його іменем у порталі.
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: documentStatus("status").default("pending").notNull(),
    signerName: text("signer_name"),
    signerIp: text("signer_ip"),
    note: text("note"),
    respondedAt: timestamp("responded_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("documents_project_id_idx").on(t.projectId)],
);

export const memberRole = pgEnum("member_role", ["pm", "junior"]);

// Власник проєкту береться з projects.owner_id; тут лише PM і джуни, яких він додав.
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_id_idx").on(t.userId),
  ],
);

// Особисті повідомлення двох учасників проєкту. Хто кому може писати, вирішує canChat().
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("chat_messages_pair_idx").on(
      t.projectId,
      t.senderId,
      t.recipientId,
      t.createdAt,
    ),
  ],
);

export const activityActorType = pgEnum("activity_actor_type", [
  "owner",
  "client",
  "system",
]);

// Історія подій проєкту. Назви етапів і файлів зберігаємо в data: самі записи можуть бути видалені.
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    actorType: activityActorType("actor_type").notNull(),
    // null для клієнта (немає акаунта) і для системних подій.
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("activity_events_project_id_created_at_idx").on(t.projectId, t.createdAt)],
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
  owner: one(user, { fields: [clients.ownerId], references: [user.id] }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(user, { fields: [projects.ownerId], references: [user.id] }),
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  milestones: many(milestones),
  comments: many(comments),
  files: many(files),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
  comments: many(comments),
  files: many(files),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  project: one(projects, {
    fields: [comments.projectId],
    references: [projects.id],
  }),
  milestone: one(milestones, {
    fields: [comments.milestoneId],
    references: [milestones.id],
  }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  milestone: one(milestones, {
    fields: [files.milestoneId],
    references: [milestones.id],
  }),
  uploader: one(user, { fields: [files.uploadedBy], references: [user.id] }),
}));
