-- Fix: deleting a document must also remove its doc-group links so group
-- doc_count stays accurate.
--
-- The Supabase dump / drizzle schema never defined a foreign key from
-- documents_doc_groups.document_id to documents.id, so on plain Postgres a
-- document delete left orphaned link rows behind. The doc_count column is
-- maintained by the update_doc_count() AFTER INSERT/DELETE trigger on
-- documents_doc_groups, so those orphaned rows also inflated every group's
-- count (they were never DELETEd, so the trigger never decremented).
--
-- This migration is idempotent: safe to run on every init.

-- 1) Remove any pre-existing orphaned links (documents that no longer exist).
--    The AFTER DELETE trigger decrements each affected group's doc_count.
DELETE FROM public.documents_doc_groups ddg
WHERE NOT EXISTS (
  SELECT 1 FROM public.documents d WHERE d.id = ddg.document_id
);

-- 2) Add the cascading FK so future document deletes clean up their links
--    (and fire the trigger to keep doc_count correct). Guarded so re-runs
--    don't error (ADD CONSTRAINT has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_doc_groups_document_id_fkey'
      AND conrelid = 'public.documents_doc_groups'::regclass
  ) THEN
    ALTER TABLE public.documents_doc_groups
      ADD CONSTRAINT documents_doc_groups_document_id_fkey
      FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
  END IF;
END$$;
