// What a crawl did, and what /crawl answers for it.
//
// A crawl is a success only when the backend accepted at least one document. Before, /crawl
// answered 200 whenever the crawler did not throw: also when every page failed to load, when
// every page was an error page, and when the backend refused every page. The user then saw
// "ingesting" for a website that gave no documents, and nothing told them why.

export interface CrawlSummary {
    /** NO_CRAWL=true: the crawler did not run. */
    disabled: boolean;
    /** Pages whose handler ran to the end. */
    pagesLoaded: number;
    /** Pages that still failed after all retries (no connection, timeout, selector not found). */
    pagesFailed: number;
    /** Loaded pages that were not sent to ingest: empty, an HTTP error status, an error page. */
    pagesSkipped: number;
    /** Loaded pages that the backend's /ingest accepted. */
    pagesIngested: number;
    /** Loaded pages that the backend's /ingest refused, or that could not be sent. */
    pagesRefused: number;
    /** Different PDF links that the crawl found. */
    pdfsFound: number;
    pdfsIngested: number;
    /** Not a PDF, or already in storage from an earlier crawl. */
    pdfsSkipped: number;
    /** Download, upload or ingest of the PDF failed. */
    pdfsFailed: number;
    /** The first failure of the crawl, for the reply. One line. */
    firstError?: string;
}

export function emptySummary(): CrawlSummary {
    return {
        disabled: false,
        pagesLoaded: 0,
        pagesFailed: 0,
        pagesSkipped: 0,
        pagesIngested: 0,
        pagesRefused: 0,
        pdfsFound: 0,
        pdfsIngested: 0,
        pdfsSkipped: 0,
        pdfsFailed: 0,
    };
}

/**
 * True the first time it is called with this key, false every time after. Crawlee runs the
 * handler of a page again when it throws, so the crawl asks this before it sends or skips a
 * page: each page then has its ingest decision, and its place in the counts, one time.
 */
export function firstTime(seen: Set<string>, key: string): boolean {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
}

export interface CrawlOutcome {
    status: number;
    /** Level of the one line that ends the crawl. */
    level: 'info' | 'warning' | 'error';
    /** Short name of the result, in the log line (`result=`) and in `errorTitle`. */
    result: 'ok' | 'partial' | 'CrawlDisabled' | 'IngestRefused' | 'NoPageLoaded' | 'NothingToIngest';
    /** Text for the person who started the crawl. */
    message: string;
}

/** The fields of the line that ends a crawl. The same names in every case, so one search finds them. */
export function summaryFields(summary: CrawlSummary): string {
    return (
        `pages_loaded=${summary.pagesLoaded} pages_failed=${summary.pagesFailed} pages_skipped=${summary.pagesSkipped} ` +
        `pages_ingested=${summary.pagesIngested} pages_refused=${summary.pagesRefused} ` +
        `pdfs_found=${summary.pdfsFound} pdfs_ingested=${summary.pdfsIngested} pdfs_skipped=${summary.pdfsSkipped} pdfs_failed=${summary.pdfsFailed}`
    );
}

export function crawlOutcome(summary: CrawlSummary): CrawlOutcome {
    const first = summary.firstError ? ` First error: ${summary.firstError}` : '';

    if (summary.disabled) {
        return {
            status: 503,
            level: 'warning',
            result: 'CrawlDisabled',
            message: 'Crawling is turned off on this server (NO_CRAWL=true).',
        };
    }

    const ingested = summary.pagesIngested + summary.pdfsIngested;
    const failures = summary.pagesFailed + summary.pagesRefused + summary.pdfsFailed;
    if (ingested > 0) {
        const partial = failures > 0;
        return {
            status: 200,
            level: partial ? 'warning' : 'info',
            result: partial ? 'partial' : 'ok',
            message:
                `Crawl completed. ${ingested} document(s) sent to ingest.` +
                (partial ? ` ${failures} page(s) or PDF(s) failed.${first}` : ''),
        };
    }

    // From here on, no document got to the backend.
    if (summary.pagesRefused > 0 || summary.pdfsFailed > 0) {
        // Something was found, and our side lost it.
        return {
            status: 502,
            level: 'error',
            result: 'IngestRefused',
            message: `The crawler read ${summary.pagesLoaded} page(s), but no document could be sent to ingest.${first}`,
        };
    }
    if (summary.pagesLoaded === 0 && summary.pagesFailed > 0) {
        return {
            status: 502,
            level: 'error',
            result: 'NoPageLoaded',
            message: `None of the ${summary.pagesFailed} page(s) could be loaded.${first}`,
        };
    }
    // Pages loaded, but each one was empty or an error page; or there was no page at all
    // (an empty sitemap). The website is the cause, so this is a WARNING.
    return {
        status: 422,
        level: 'warning',
        result: 'NothingToIngest',
        message:
            summary.pagesLoaded === 0
                ? 'The crawl found no page to read.'
                : `The crawler read ${summary.pagesLoaded} page(s), but each one was empty or an error page, so there is nothing to ingest.`,
    };
}
