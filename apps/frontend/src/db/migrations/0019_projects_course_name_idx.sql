-- The chatbots hub sorts by creation date, read from projects.created_at by course_name.
CREATE INDEX IF NOT EXISTS "projects_course_name_idx" ON "projects" USING btree ("course_name");
