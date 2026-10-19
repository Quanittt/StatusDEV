CREATE TYPE "public"."document_status" AS ENUM('pending', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"signer_name" text,
	"signer_ip" text,
	"note" text,
	"responded_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "share_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "share_password_hash" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "brand_logo_key" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "telegram_link_code" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "telegram_link_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_project_id_idx" ON "documents" USING btree ("project_id");