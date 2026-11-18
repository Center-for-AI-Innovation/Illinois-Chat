import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crawlOutcome, emptySummary, summaryFields } from './crawlOutcome.js';

const summary = (changes: Partial<ReturnType<typeof emptySummary>>) => ({ ...emptySummary(), ...changes });

test('a crawl whose pages all got to ingest is a 200 at INFO', () => {
    const outcome = crawlOutcome(summary({ pagesLoaded: 3, pagesIngested: 3 }));
    assert.equal(outcome.status, 200);
    assert.equal(outcome.level, 'info');
    assert.equal(outcome.result, 'ok');
});

test('a crawl with some failures is a 200 at WARNING and names the first error', () => {
    const outcome = crawlOutcome(summary({ pagesLoaded: 2, pagesIngested: 2, pagesFailed: 1, firstError: 'https://a/b: TimeoutError' }));
    assert.equal(outcome.status, 200);
    assert.equal(outcome.level, 'warning');
    assert.equal(outcome.result, 'partial');
    assert.match(outcome.message, /1 page\(s\) or PDF\(s\) failed\. First error: https:\/\/a\/b: TimeoutError/);
});

test('a PDF alone makes the crawl a success', () => {
    assert.equal(crawlOutcome(summary({ pagesLoaded: 1, pagesSkipped: 1, pdfsFound: 1, pdfsIngested: 1 })).status, 200);
});

test('every page failed to load: 502 NoPageLoaded at ERROR, not a 200', () => {
    const outcome = crawlOutcome(summary({ pagesFailed: 4, firstError: 'https://gone.example/: net::ERR_NAME_NOT_RESOLVED' }));
    assert.equal(outcome.status, 502);
    assert.equal(outcome.level, 'error');
    assert.equal(outcome.result, 'NoPageLoaded');
    assert.match(outcome.message, /None of the 4 page\(s\) could be loaded\. First error: https:\/\/gone\.example/);
});

test('the backend refused every page: 502 IngestRefused at ERROR', () => {
    const outcome = crawlOutcome(summary({ pagesLoaded: 5, pagesRefused: 5, firstError: 'ingest answered 500 for https://a/' }));
    assert.equal(outcome.status, 502);
    assert.equal(outcome.level, 'error');
    assert.equal(outcome.result, 'IngestRefused');
});

test('every PDF failed and no page was ingested: 502 IngestRefused', () => {
    assert.equal(crawlOutcome(summary({ pagesLoaded: 1, pagesSkipped: 1, pdfsFound: 2, pdfsFailed: 2 })).result, 'IngestRefused');
});

test('every page was an error page: 422 NothingToIngest at WARNING', () => {
    const outcome = crawlOutcome(summary({ pagesLoaded: 2, pagesSkipped: 2 }));
    assert.equal(outcome.status, 422);
    assert.equal(outcome.level, 'warning');
    assert.equal(outcome.result, 'NothingToIngest');
    assert.match(outcome.message, /each one was empty or an error page/);
});

test('no page at all (an empty sitemap): 422 NothingToIngest', () => {
    const outcome = crawlOutcome(emptySummary());
    assert.equal(outcome.status, 422);
    assert.equal(outcome.message, 'The crawl found no page to read.');
});

test('only PDFs that were skipped as copies: 422, not a failure', () => {
    assert.equal(crawlOutcome(summary({ pagesLoaded: 1, pagesSkipped: 1, pdfsFound: 1, pdfsSkipped: 1 })).status, 422);
});

test('NO_CRAWL=true: 503 CrawlDisabled, also when the counts are zero', () => {
    const outcome = crawlOutcome(summary({ disabled: true }));
    assert.equal(outcome.status, 503);
    assert.equal(outcome.result, 'CrawlDisabled');
});

test('the summary line has every count under a fixed name', () => {
    assert.equal(
        summaryFields(summary({ pagesLoaded: 1, pagesFailed: 2, pagesSkipped: 3, pagesIngested: 4, pagesRefused: 5, pdfsFound: 6, pdfsIngested: 7, pdfsSkipped: 8, pdfsFailed: 9 })),
        'pages_loaded=1 pages_failed=2 pages_skipped=3 pages_ingested=4 pages_refused=5 pdfs_found=6 pdfs_ingested=7 pdfs_skipped=8 pdfs_failed=9',
    );
});
