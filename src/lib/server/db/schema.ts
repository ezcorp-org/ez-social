import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  primaryKey,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────────────
// Reconciled with Auth.js required fields + custom passwordHash
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique().notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: varchar("password_hash", { length: 255 }),
  preferredModel: varchar("preferred_model", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Accounts (Auth.js OAuth — required by adapter) ─────────────
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

// ─── Sessions (Auth.js — included for future flexibility) ───────
export const sessions = pgTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

// ─── Verification Tokens (Auth.js) ─────────────────────────────
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token] }),
  ],
);

// ─── Personas ────────────────────────────────────────────────────
export const personas = pgTable(
  "personas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    platform: varchar("platform", { length: 50 }), // Visual identity icon/color only
    isDefault: boolean("is_default").default(false).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }), // Soft delete
    activeVoiceVersionId: uuid("active_voice_version_id"), // Points to current active voice profile version
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("personas_user_id_idx").on(table.userId)],
);

// ─── Writing Samples ─────────────────────────────────────────────
export const writingSamples = pgTable(
  "writing_samples",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    platform: varchar("platform", { length: 50 }), // twitter, linkedin, blog, etc.
    wordCount: integer("word_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("writing_samples_persona_id_idx").on(table.personaId)],
);

// ─── Voice Profile Versions ──────────────────────────────────────
export const voiceProfileVersions = pgTable(
  "voice_profile_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    extractedProfile: jsonb("extracted_profile").notNull(), // Full VoiceProfile JSON
    manualEdits: jsonb("manual_edits"), // User overrides stored separately
    calibrationFeedback: jsonb("calibration_feedback"), // Ratings from calibration sessions
    platform: varchar("platform", { length: 50 }), // null = default (all platforms), non-null = platform-specific override
    sampleCount: integer("sample_count").notNull(),
    samplePlatforms: jsonb("sample_platforms").notNull(), // e.g. ["twitter", "blog"]
    totalWordCount: integer("total_word_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("voice_versions_persona_id_idx").on(table.personaId),
    index("voice_versions_persona_platform_idx").on(table.personaId, table.platform),
  ],
);

// ─── Post Queue ──────────────────────────────────────────────────
export const postQueue = pgTable(
  "post_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id").references(() => personas.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    platform: varchar("platform", { length: 50 }),
    postContent: text("post_content"),
    postAuthor: varchar("post_author", { length: 255 }),
    status: varchar("status", { length: 50 }).default("new").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("post_queue_user_id_status_idx").on(table.userId, table.status),
    index("post_queue_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

// ─── Chat Messages ───────────────────────────────────────────────
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postQueue.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
    parts: jsonb("parts").notNull(), // UIMessage.parts array (AI SDK v6 parts-based format)
    metadata: jsonb("metadata"), // optional metadata (e.g., personaId at time of message)
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("chat_messages_post_id_idx").on(table.postId),
    index("chat_messages_post_id_created_at_idx").on(
      table.postId,
      table.createdAt,
    ),
  ],
);

// ─── Draft Edits ─────────────────────────────────────────────────
export const draftEdits = pgTable(
  "draft_edits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: varchar("message_id", { length: 255 })
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => postQueue.id, { onDelete: "cascade" }),
    originalText: text("original_text").notNull(),
    editedText: text("edited_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("draft_edits_message_id_idx").on(table.messageId),
    index("draft_edits_post_id_idx").on(table.postId),
  ],
);

// ─── AI Usage Log ───────────────────────────────────────────
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => postQueue.id, {
      onDelete: "set null",
    }),
    personaId: uuid("persona_id").references(() => personas.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 30 }).notNull(), // 'chat' | 'voice_extraction' | 'calibration'
    model: varchar("model", { length: 100 }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costMicrocents: integer("cost_microcents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_usage_log_user_id_idx").on(table.userId),
    index("ai_usage_log_post_id_idx").on(table.postId),
  ],
);

// ─── Draft Feedback ──────────────────────────────────────────────
export const draftFeedback = pgTable(
  "draft_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postQueue.id, { onDelete: "cascade" }),
    messageId: varchar("message_id", { length: 255 })
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id").references(() => personas.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 20 }).notNull(), // 'accepted' | 'rejected' | 'edited'
    draftText: text("draft_text").notNull(),
    editedText: text("edited_text"), // Only set when action is 'edited'
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("draft_feedback_persona_id_idx").on(table.personaId),
    index("draft_feedback_post_id_idx").on(table.postId),
  ],
);

// ─── Relations ──────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  personas: many(personas),
  postQueue: many(postQueue),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const personasRelations = relations(personas, ({ one, many }) => ({
  user: one(users, { fields: [personas.userId], references: [users.id] }),
  writingSamples: many(writingSamples),
  voiceProfileVersions: many(voiceProfileVersions),
  postQueue: many(postQueue),
  draftFeedback: many(draftFeedback),
}));

export const writingSamplesRelations = relations(writingSamples, ({ one }) => ({
  persona: one(personas, {
    fields: [writingSamples.personaId],
    references: [personas.id],
  }),
}));

export const voiceProfileVersionsRelations = relations(
  voiceProfileVersions,
  ({ one }) => ({
    persona: one(personas, {
      fields: [voiceProfileVersions.personaId],
      references: [personas.id],
    }),
  }),
);

export const postQueueRelations = relations(postQueue, ({ one, many }) => ({
  user: one(users, { fields: [postQueue.userId], references: [users.id] }),
  persona: one(personas, {
    fields: [postQueue.personaId],
    references: [personas.id],
  }),
  chatMessages: many(chatMessages),
  draftEdits: many(draftEdits),
  draftFeedback: many(draftFeedback),
}));

export const chatMessagesRelations = relations(
  chatMessages,
  ({ one, many }) => ({
    post: one(postQueue, {
      fields: [chatMessages.postId],
      references: [postQueue.id],
    }),
    draftEdits: many(draftEdits),
    draftFeedback: many(draftFeedback),
  }),
);

export const draftEditsRelations = relations(draftEdits, ({ one }) => ({
  message: one(chatMessages, {
    fields: [draftEdits.messageId],
    references: [chatMessages.id],
  }),
  post: one(postQueue, {
    fields: [draftEdits.postId],
    references: [postQueue.id],
  }),
}));

export const aiUsageLogRelations = relations(aiUsageLog, ({ one }) => ({
  user: one(users, { fields: [aiUsageLog.userId], references: [users.id] }),
  post: one(postQueue, { fields: [aiUsageLog.postId], references: [postQueue.id] }),
  persona: one(personas, { fields: [aiUsageLog.personaId], references: [personas.id] }),
}));

export const draftFeedbackRelations = relations(draftFeedback, ({ one }) => ({
  post: one(postQueue, {
    fields: [draftFeedback.postId],
    references: [postQueue.id],
  }),
  message: one(chatMessages, {
    fields: [draftFeedback.messageId],
    references: [chatMessages.id],
  }),
  persona: one(personas, {
    fields: [draftFeedback.personaId],
    references: [personas.id],
  }),
}));
