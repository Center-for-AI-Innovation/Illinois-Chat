-- Track chatbot (project) deletions so the heavy cleanup can run in the
-- background instead of inside the HTTP request.
--
-- Deleting a chatbot is split in two:
--   1. The request inserts a row here, removes the chatbot's metadata (so it
--      disappears from every page and access check immediately) and enqueues
--      a purge job. It returns 202 without touching documents, vectors or S3.
--   2. The ingest worker's delete consumer purges vectors, documents,
--      conversations and S3 objects in small batches, recording progress in
--      `progress` so a crashed or failed job resumes where it stopped. The
--      `projects` row is deleted last.
--
-- While a row is active (status <> 'completed') the name stays reserved:
-- project creation and ingest both refuse it, so a new chatbot cannot be
-- created on top of data that is still being removed.
--
-- `project_id` has no foreign key on purpose: the projects row is deleted at
-- the end of the purge and this row must outlive it as the audit record.
-- `metadata_backup` holds the course metadata as it was before deletion
-- (Redis `course_metadatas` value); it never holds LLM provider keys.

CREATE TABLE IF NOT EXISTS "project_deletions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_name" text NOT NULL,
	"project_id" bigint,
	"requested_by" text NOT NULL,
	"include_external" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata_backup" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
-- At most one active deletion per name; also what makes the name reservation
-- race-free.
CREATE UNIQUE INDEX IF NOT EXISTS "project_deletions_active_name_idx" ON "project_deletions" USING btree ("project_name") WHERE "status" <> 'completed';
