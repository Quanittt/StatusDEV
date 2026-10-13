CREATE TYPE "public"."comment_author_type" AS ENUM('owner', 'client');--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "author_type" "comment_author_type" DEFAULT 'owner' NOT NULL;