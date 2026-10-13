import { relations } from "drizzle-orm";
import {
  index,
  integer,
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
