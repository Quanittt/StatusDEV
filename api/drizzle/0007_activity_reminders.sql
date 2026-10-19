CREATE TYPE "public"."activity_actor_type" AS ENUM('owner', 'client', 'system');--> statement-breakpoint
CREATE TYPE "public"."milestone_client_response" AS ENUM('approved', 'changes_requested');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"actor_type" "activity_actor_type" NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "client_response" "milestone_client_response";--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "client_response_note" text;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "client_responded_at" timestamp;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "soon_reminded_at" timestamp;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "overdue_reminded_at" timestamp;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_project_id_created_at_idx" ON "activity_events" USING btree ("project_id","created_at");--> statement-breakpoint
-- Етапи, прострочені до цієї міграції, не повинні розсилати нагадування масово.
UPDATE "milestones" SET "soon_reminded_at" = now(), "overdue_reminded_at" = now() WHERE "due_date" IS NOT NULL AND "due_date" + interval '1 day' <= now();
