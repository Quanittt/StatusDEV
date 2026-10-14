ALTER TABLE "projects" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_share_token_unique" UNIQUE("share_token");