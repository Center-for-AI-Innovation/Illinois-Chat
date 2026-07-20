CREATE TABLE "scraping_metadata_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_name" text NOT NULL,
	"url" text NOT NULL,
	"max_urls" integer DEFAULT 50,
	"scrape_strategy" text DEFAULT 'equal-and-below',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scraping_metadata_run_course_url_params_key" ON "scraping_metadata_run" USING btree ("course_name","url","max_urls","scrape_strategy");