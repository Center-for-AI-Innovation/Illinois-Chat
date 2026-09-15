-- Store the per-project Sim API key as an encrypted JSONB envelope instead of
-- plaintext text, using the same `{ "encrypted": "v1.<ct>.<iv>" }` shape and
-- ENCRYPTION_MASTER_KEY as project_external_connections.
--
-- Encryption happens in application code, so this migration cannot encrypt
-- existing values. It wraps them as `{ "plaintext": "<key>" }`; the frontend
-- resolver accepts that legacy shape and rewrites it as an encrypted envelope
-- the first time the project's key is read.
--
-- Idempotent: guarded on the column still being `text`, so the start scripts
-- can apply it on every boot. An envelope that application code wrote before
-- this ran (drizzle serialises jsonb as JSON text) is cast rather than
-- re-wrapped.
--
-- Rollback (lossy — encrypted keys must be re-entered by a project admin):
--   ALTER TABLE "projects" ALTER COLUMN "sim_api_key" TYPE text
--     USING "sim_api_key"->>'plaintext';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'sim_api_key'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "projects"
      ALTER COLUMN "sim_api_key" TYPE jsonb
      USING CASE
        WHEN "sim_api_key" IS NULL OR "sim_api_key" = '' THEN NULL
        WHEN "sim_api_key" LIKE '{"encrypted":%' THEN "sim_api_key"::jsonb
        ELSE jsonb_build_object('plaintext', "sim_api_key")
      END;
  END IF;
END $$;
