CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"post_id" uuid NOT NULL,
	"original_text" text NOT NULL,
	"edited_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"persona_id" uuid,
	"action" varchar(20) NOT NULL,
	"draft_text" text NOT NULL,
	"edited_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"platform" varchar(50),
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"active_voice_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"persona_id" uuid,
	"url" text NOT NULL,
	"platform" varchar(50),
	"post_content" text,
	"post_author" varchar(255),
	"status" varchar(50) DEFAULT 'new' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" varchar(255),
	"preferred_model" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "voice_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"extracted_profile" jsonb NOT NULL,
	"manual_edits" jsonb,
	"calibration_feedback" jsonb,
	"platform" varchar(50),
	"sample_count" integer NOT NULL,
	"sample_platforms" jsonb NOT NULL,
	"total_word_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"content" text NOT NULL,
	"platform" varchar(50),
	"word_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_post_id_post_queue_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_edits" ADD CONSTRAINT "draft_edits_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_edits" ADD CONSTRAINT "draft_edits_post_id_post_queue_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_feedback" ADD CONSTRAINT "draft_feedback_post_id_post_queue_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_feedback" ADD CONSTRAINT "draft_feedback_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_feedback" ADD CONSTRAINT "draft_feedback_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_queue" ADD CONSTRAINT "post_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_queue" ADD CONSTRAINT "post_queue_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profile_versions" ADD CONSTRAINT "voice_profile_versions_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_samples" ADD CONSTRAINT "writing_samples_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_post_id_idx" ON "chat_messages" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "chat_messages_post_id_created_at_idx" ON "chat_messages" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "draft_edits_message_id_idx" ON "draft_edits" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "draft_edits_post_id_idx" ON "draft_edits" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "draft_feedback_persona_id_idx" ON "draft_feedback" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "draft_feedback_post_id_idx" ON "draft_feedback" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "personas_user_id_idx" ON "personas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "post_queue_user_id_status_idx" ON "post_queue" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "post_queue_user_id_created_at_idx" ON "post_queue" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "voice_versions_persona_id_idx" ON "voice_profile_versions" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "voice_versions_persona_platform_idx" ON "voice_profile_versions" USING btree ("persona_id","platform");--> statement-breakpoint
CREATE INDEX "writing_samples_persona_id_idx" ON "writing_samples" USING btree ("persona_id");