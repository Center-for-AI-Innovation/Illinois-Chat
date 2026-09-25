-- Give folders a real owner (a project) and stop deleting one from stranding
-- the conversations inside it.
--
-- Folders previously had no course association at all: the chat sidebar
-- filtered the conversations *inside* a folder by project, but the folder list
-- itself was filtered only by user_email, so a folder created in one course
-- showed up in every other course the user could open. An empty folder had
-- nothing to derive a course from, so this was not fixable without storing the
-- link.
--
-- conversations.folder_id had no foreign key either: deleting a folder removed
-- only the folders row and left its conversations pointing at an id that no
-- longer existed. Those conversations then became unreachable in the UI,
-- because search_conversations_v3 only returns rows with folder_id IS NULL and
-- the folders endpoint had no folder left to nest them under. The rows survived
-- in the database with no way to get them back short of manual SQL.
--
-- Both are foreign keys rather than plain columns, matching the convention
-- already used by project_external_connections. Projects are inserted
-- synchronously before a project goes live (see ProjectService.create_project),
-- so every course the frontend can reach has a row to reference.

-- ---------------------------------------------------------------------------
-- 1. Scope folders to a project.
-- ---------------------------------------------------------------------------

-- Left nullable for the backfill below: folders that hold no conversations have
-- no project to infer, and those rows are kept rather than deleted. The API
-- treats project_id IS NULL as "not in any course", so such folders are hidden
-- until they are reassigned. See the note at the bottom about tightening this
-- to NOT NULL once the legacy rows have been dealt with.
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "project_id" bigint;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'folders_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "folders"
      ADD CONSTRAINT "folders_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- The sidebar always queries folders by (user_email, project_id).
CREATE INDEX IF NOT EXISTS "folders_user_email_project_id_idx"
  ON "folders" USING btree ("user_email", "project_id");--> statement-breakpoint

-- Backfill from the conversations already inside each folder. A folder can
-- currently hold conversations from several courses (that is the bug this
-- migration closes), so pick the course contributing the most conversations and
-- break ties on the oldest conversation. Conversations left behind in another
-- course keep their folder_id and simply stop being listed there.
WITH folder_project AS (
  SELECT DISTINCT ON (c.folder_id)
    c.folder_id,
    p.id AS project_id
  FROM conversations c
  JOIN LATERAL (
    SELECT pr.id FROM projects pr
    WHERE pr.course_name = c.project_name
    ORDER BY pr.id
    LIMIT 1
  ) p ON TRUE
  WHERE c.folder_id IS NOT NULL
  GROUP BY c.folder_id, p.id
  ORDER BY c.folder_id, COUNT(*) DESC, MIN(c.created_at) ASC
)
UPDATE folders f
SET project_id = fp.project_id
FROM folder_project fp
WHERE f.id = fp.folder_id
  AND f.project_id IS NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Stop folder deletion from orphaning conversations.
-- ---------------------------------------------------------------------------

-- database.types.ts still declares conversations_folder_id_fkey, so this
-- constraint existed before the move off Supabase and was lost on the way.
-- Existing orphans would violate it, so clear them first. These are exactly the
-- conversations already invisible in the UI; this makes them reappear under
-- their project.
UPDATE conversations
SET folder_id = NULL
WHERE folder_id IS NOT NULL
  AND folder_id NOT IN (SELECT id FROM folders);--> statement-breakpoint

-- ON DELETE SET NULL puts the conversations back in the main sidebar list
-- instead of hiding them. Doing it with a constraint rather than in the API
-- also covers the folders.project_id cascade added above: dropping a project
-- deletes its folders inside the database, where API code cannot intervene.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_folder_id_folders_id_fk'
  ) THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_folder_id_folders_id_fk"
      FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- Supports both the FK's own lookups and the folder-contents query.
CREATE INDEX IF NOT EXISTS "conversations_folder_id_idx"
  ON "conversations" USING btree ("folder_id");

-- Folders left with a NULL project_id never held a conversation. To tighten
-- this column once those have been reviewed:
--   DELETE FROM folders WHERE project_id IS NULL;
--   ALTER TABLE folders ALTER COLUMN project_id SET NOT NULL;
