CREATE TABLE "scraping_metadata_documents" (
	"scrape_metadata_run_id" uuid NOT NULL,
	"document_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scraping_metadata_documents_scrape_metadata_run_id_document_id_pk" PRIMARY KEY("scrape_metadata_run_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "scraping_metadata_documents" ADD CONSTRAINT "scraping_metadata_documents_scrape_metadata_run_id_scraping_metadata_run_id_fk" FOREIGN KEY ("scrape_metadata_run_id") REFERENCES "public"."scraping_metadata_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraping_metadata_documents" ADD CONSTRAINT "scraping_metadata_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scraping_metadata_documents_document_id_idx" ON "scraping_metadata_documents" USING btree ("document_id");