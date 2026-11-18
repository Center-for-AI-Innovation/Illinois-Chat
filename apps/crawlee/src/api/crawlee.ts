// For more information, see https://crawlee.dev/
import {
  Configuration,
  Log,
  PlaywrightCrawler,
  downloadListOfUrls,
  log as rootLog,
} from "crawlee";
import { Page } from "playwright";

import { CrawlSummary, emptySummary } from "../crawlOutcome.js";
import { oneLine } from "../logSetup.js";
import { Config, configSchema } from "./configValidation.js";
import { ingestPdf, uploadPdfToS3 } from "./uploadToS3.js";

// An ingest request that gets no answer in this time counts as refused. Without a limit,
// one request that hangs would keep the crawl, and its reply, open with no end.
const INGEST_TIMEOUT_MS = 60_000;

// clog carries the "rid=<id> course=<name>" prefix for this crawl. requestId is forwarded
// to the backend /ingest as X-Request-ID so the ingest job logs the same id.
// Returns what the crawl did. It returns after every ingest request and every PDF of the
// crawl has an answer, so the counts are final and no line of the crawl comes after its
// "crawl done" line.
export async function crawl(
  rawConfig: Config,
  clog: Log = rootLog,
  requestId?: string,
): Promise<CrawlSummary> {
  const config = configSchema.parse(removeUndefinedFromObject(rawConfig));

  const summary = emptySummary();
  // The work that goes on after a page handler returns: ingest requests and PDFs.
  const pending: Promise<void>[] = [];
  const seenPdfs = new Set<string>();
  const noteError = (text: string) => {
    summary.firstError ??= text.slice(0, 300);
  };

  // One PDF is often linked from many pages. Handle each link once per crawl.
  const queuePdf = (url: string, log: Log) => {
    if (seenPdfs.has(url)) return;
    seenPdfs.add(url);
    summary.pdfsFound++;
    log.debug(`Downloading PDF: ${oneLine(url)}`);
    pending.push(
      handlePdf(
        config.courseName,
        config.url,
        url,
        config.documentGroups,
        log,
        requestId,
      ).then((result) => {
        if (result === "ingested") summary.pdfsIngested++;
        else if (result === "skipped") summary.pdfsSkipped++;
        else {
          summary.pdfsFailed++;
          noteError(`PDF failed url=${oneLine(url)}`);
        }
      }),
    );
  };

  if (config.url) {
    clog.debug(`Crawling URL: ${oneLine(config.url)}`);
    if (process.env.NO_CRAWL === "true") {
      summary.disabled = true;
      return summary;
    }
    // Checked once, before the crawl: without it no page can get to the backend, and
    // the crawl would read every page for nothing.
    const ingestUrl = process.env.INGEST_URL;
    if (!ingestUrl) {
      throw new Error(
        "INGEST_URL is not set, so the crawler cannot send pages to ingest.",
      );
    }
    {
      // PlaywrightCrawler crawls the web using a headless
      // browser controlled by the Playwright library.

      let crawler: PlaywrightCrawler;

      try {
        crawler = new PlaywrightCrawler(
          {
            // TODO: add these back...
            maxConcurrency: config.maxConcurrency,
            maxRequestsPerMinute: config.maxRequestsPerMinute,
            // The crawler and its handlers log through clog, so every line has rid and course.
            log: clog,
            launchContext: {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
              },
            },

            // Use the requestHandler to process each of the crawled pages.
            // removed , pushData from params... weird try catch behavior
            async requestHandler({ request, response, page, enqueueLinks, log }) {
              log.debug(`Crawling: ${request.loadedUrl}...`);
              const title = await page.title();
              log.debug(
                `Crawling: Page ${summary.pagesLoaded + 1} / ${config.maxPagesToCrawl} - URL: ${request.loadedUrl}...`,
              );

              // Use custom handling for XPath selector
              if (config.selector) {
                if (config.selector.startsWith("/")) {
                  await waitForXPath(
                    page,
                    config.selector,
                    config.waitForSelectorTimeout ?? 1000,
                  );
                } else {
                  await page.waitForSelector(config.selector, {
                    timeout: config.waitForSelectorTimeout ?? 1000,
                  });
                }
              }
              // page.on('console', message => console.log(`Page log: ${message.text()}`)); // refactored for memory leaks
              const consoleListener = (message: { text: () => any }) =>
                log.debug(`Page log: ${oneLine(message.text())}`);
              page.on("console", consoleListener);
              const html = await getPageHtml(page, config.selector);

              // Grab results from the page
              if (request.loadedUrl) {
                // Asynchronously call the ingestWebscrape endpoint without awaiting the result.
                // Skip error/empty pages (soft-404s, dead links, paywalls) so they never enter
                // the corpus. The ingest POST is fire-and-forget, so we log every skip with a
                // greppable SKIP-INGEST prefix to keep the pipeline monitorable from the logs.
                const skipReason = shouldSkipIngest(title, html, response?.status());
                if (skipReason) {
                  summary.pagesSkipped++;
                  log.warning(
                    `SKIP-INGEST (${skipReason}): status=${response?.status() ?? "n/a"} ` +
                      `base_url=${oneLine(config.url)} url=${oneLine(request.loadedUrl)} title=${JSON.stringify(title)}`,
                  );
                } else {
                  const pageUrl = request.loadedUrl;
                  // Not awaited here, so the crawler goes on to the next page. crawl()
                  // waits for it before it returns.
                  const sent = fetch(ingestUrl, {
                    method: "POST",
                    signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
                    headers: {
                      Accept: "*/*",
                      "Accept-Encoding": "gzip, deflate",
                      "Content-Type": "application/json",
                      ...(requestId ? { "X-Request-ID": requestId } : {}),
                    },
                    body: JSON.stringify({
                      base_url: config.url,
                      url: request.loadedUrl,
                      readable_filename: title,
                      content: html,
                      course_name: config.courseName,
                      groups: config.documentGroups,
                    }),
                  })
                    .then(async (response) => {
                      const text = await response.text();
                      if (!response.ok) {
                        summary.pagesRefused++;
                        noteError(
                          `ingest answered ${response.status} for ${oneLine(pageUrl)}`,
                        );
                        log.error(
                          `Ingest request failed url=${pageUrl} status=${response.status} ` +
                            `body=${oneLine(text.slice(0, 500))}`,
                        );
                        return;
                      }
                      summary.pagesIngested++;
                    })
                    .catch((err) => {
                      summary.pagesRefused++;
                      noteError(
                        `ingest request failed for ${oneLine(pageUrl)}: ${oneLine(err)}`,
                      );
                      log.error(
                        `Ingest request failed url=${pageUrl}: ${oneLine(err)}` +
                          (err?.cause ? ` (cause: ${oneLine(err.cause)})` : ""),
                      );
                    });
                  pending.push(sent);
                }
              }

              page.off("console", consoleListener); // remove listener to avoid memory leak

              // Extract links from the current page and add them to the crawling queue.
              // Docs https://crawlee.dev/docs/introduction/adding-urls#filtering-links-to-same-domain
              // 1. scrape all -- wander the internet.
              // 2. scrape domain and all subdomains.
              // 3. scrape just equal and below the given URL -- match statement.
              if (
                config.scrapeStrategy == "all" ||
                config.scrapeStrategy == "same-domain" ||
                config.scrapeStrategy == "same-hostname"
              ) {
                await enqueueLinks({
                  strategy: config.scrapeStrategy,
                  exclude:
                    typeof config.exclude === "string"
                      ? [config.exclude]
                      : config.exclude ?? [],

                  // Keep this here so if we encounter .pdfs (no matter what URL or strategy), we still grab them
                  transformRequestFunction(req) {
                    if (req.url.endsWith(".pdf")) {
                      // Download PDFs specially
                      queuePdf(req.url, log);
                      return false;
                    } else {
                      return req;
                    }
                  },
                });
              } else {
                // strategy: 'equal-and-below' == stay on the same domain and subdomains (aka. hostname)
                await enqueueLinks({
                  strategy: "same-hostname",
                  globs:
                    typeof config.match === "string"
                      ? [config.match]
                      : config.match,
                  exclude:
                    typeof config.exclude === "string"
                      ? [config.exclude]
                      : config.exclude ?? [],

                  // Keep this here so if we encounter .pdfs (no matter what URL or strategy), we still grab them
                  transformRequestFunction(req) {
                    if (req.url.endsWith(".pdf")) {
                      // Download PDFs specially
                      queuePdf(req.url, log);
                      return false;
                    } else {
                      return req;
                    }
                  },
                });
              }
              // Counted at the end: a handler that throws is tried again, and a count
              // at the start would count that page one time for each try.
              summary.pagesLoaded++;
            },
            // Comment this option to scrape the full website.
            maxRequestsPerCrawl: config.maxPagesToCrawl,
            // Uncomment this option to see the browser window.
            // headless: false,
            preNavigationHooks: [
              // Abort requests for certain resource types
              async ({ request, page, log }) => {
                // If there are no resource exclusions, return
                const RESOURCE_EXCLUSTIONS = config.resourceExclusions ?? [];
                if (RESOURCE_EXCLUSTIONS.length === 0) {
                  return;
                }
                if (config.cookie) {
                  const cookies = (
                    Array.isArray(config.cookie)
                      ? config.cookie
                      : [config.cookie]
                  ).map((cookie: { name: any; value: any }) => {
                    return {
                      name: cookie.name,
                      value: cookie.value,
                      url: request.loadedUrl,
                    };
                  });
                  await page.context().addCookies(cookies);
                }
                await page.route(
                  `**\/*.{${RESOURCE_EXCLUSTIONS.join()}}`,
                  (route) => {
                    log.debug(
                      `skipping excluded resource url=${route.request().url()}`,
                    );
                    return route.abort("aborted");
                  },
                );
              },
            ],
            // Called once a page has failed every retry. The crawl goes on with the other pages.
            failedRequestHandler({ request, log }, error) {
              summary.pagesFailed++;
              noteError(
                `${oneLine(request.url)}: ${error.name}: ${oneLine(error.message.split("\n")[0])}`,
              );
              log.warning(
                `Page failed after all retries url=${request.url}: ` +
                  `${error.name}: ${oneLine(error.message.split("\n")[0])}`,
              );
            },
          },
          new Configuration({
            persistStorage: false,
          }),
        );

        const isUrlASitemap = /sitemap.*\.xml$/.test(config.url);
        if (isUrlASitemap) {
          const listOfUrls = await downloadListOfUrls({ url: config.url });

          // Add the initial URL to the crawling queue.
          await crawler.addRequests(listOfUrls);

          await crawler.run();
        } else {
          // Add first URL to the queue and start the crawl.
          await crawler.run([config.url]);
        }
        if (crawler) {
          await crawler.teardown();
          // const store = await KeyValueStore.open();
          // await store.drop();
        }
      } finally {
        // Also when the crawler throws: the requests that were sent still get their
        // answer inside this crawl, with its request id. None of them rejects.
        await Promise.all(pending);
      }
      // An error from the crawler is not caught here: /crawl in main.ts logs it once
      // and returns 500.
    }
  }
  return summary;
}

// ----- HELPERS -----

// Page titles that almost always indicate an error/placeholder page rather than real
// content (matched case-insensitively against the page <title>). Soft-404s commonly
// return HTTP 200 with one of these titles, so the title is the reliable signal.
const ERROR_TITLE_PATTERNS: RegExp[] = [
  /\b(404|403|410)\b/,
  /page not found/i,
  /\bnot found\b/i,
  /error\s*[: ]?\s*40\d/i,
  /\bforbidden\b/i,
  /access denied/i,
  /document not found/i,
  /no longer (available|exists)/i,
  /(temporarily|service|currently) unavailable/i,
  /site (can.?t|cannot) be reached/i,
  /account suspended/i,
  /under construction/i,
  /\b410 gone\b/i,
];

// Body-text phrases that indicate an error page. Trusted only on SHORT pages — real
// articles are long and may legitimately mention these phrases, so we bound the
// false-positive risk by length rather than dropping content matching entirely.
const ERROR_CONTENT_PATTERNS: RegExp[] = [
  /the page you (requested|are looking for) (could not be|was not|cannot be|can.?t be) found/i,
  /the requested url .{0,40} was not found on this server/i,
  /this page (doesn.?t|does not) exist/i,
  /we can.?t find the page/i,
  /sorry,? (this|the) page/i,
  /page not found/i,
];

const MIN_CONTENT_CHARS = 30; // trimmed body shorter than this == effectively empty
const SHORT_CONTENT_CHARS = 350; // only trust ERROR_CONTENT_PATTERNS on pages this short

// Decide whether a crawled page should be SKIPPED (not POSTed to the ingest endpoint).
// Returns a short reason string when it should be skipped, or null for good content.
// Catches: empty pages, hard HTTP 4xx/5xx, soft-404s (HTTP 200 + error title), and short
// error-page bodies. Logged by the caller with a greppable SKIP-INGEST prefix.
function shouldSkipIngest(
  title: string,
  content: string,
  status?: number,
): string | null {
  const text = (content ?? "").trim();
  if (text.length < MIN_CONTENT_CHARS) return "empty-content";
  if (typeof status === "number" && status >= 400) return `http-${status}`;
  const t = (title ?? "").trim();
  if (t && ERROR_TITLE_PATTERNS.some((re) => re.test(t))) return "error-title";
  if (
    text.length <= SHORT_CONTENT_CHARS &&
    ERROR_CONTENT_PATTERNS.some((re) => re.test(text))
  ) {
    return "error-content";
  }
  return null;
}

// Never rejects: crawl() waits for it with the other work of the crawl.
async function handlePdf(
  courseName: string,
  base_url: string,
  url: string,
  documentGroups: string[],
  clog: Log,
  requestId?: string,
): Promise<"ingested" | "skipped" | "failed"> {
  try {
    const s3Key = await uploadPdfToS3(url, courseName, clog);
    // Not a real PDF (redirected to HTML), or already in storage: no ingest.
    if (!s3Key) return "skipped";
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const accepted = await ingestPdf(
      s3Key,
      courseName,
      base_url,
      url,
      documentGroups,
      clog,
      requestId,
    );
    return accepted ? "ingested" : "failed";
  } catch (error) {
    clog.error(`PDF upload failed url=${oneLine(url)}: ${oneLine(error)}`);
    return "failed";
  }
}
function getPageHtml(page: Page, selector = "body") {
  return page.evaluate((selector) => {
    // Exclude header, footer, nav from scraping
    const elementsToExclude = document.querySelectorAll("header, footer, nav");
    elementsToExclude.forEach((element) => element.remove());
    // Check if the selector is an XPath
    if (selector.startsWith("/")) {
      console.log(`XPath: ${selector}`);
      const elements = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ANY_TYPE,
        null,
      );
      const result = elements.iterateNext();
      return result ? result.textContent || "" : "";
    } else {
      // Handle as a CSS selector
      const el = document.querySelector(selector) as HTMLElement | null;
      return el?.innerText || "";
    }
  }, selector);
}

async function waitForXPath(page: Page, xpath: string, timeout: number) {
  await page.waitForFunction(
    (xpath) => {
      const elements = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ANY_TYPE,
        null,
      );
      return elements.iterateNext() !== null;
    },
    xpath,
    { timeout },
  );
}

function removeUndefinedFromObject(obj: Record<string, any>) {
  Object.keys(obj).forEach((key) => {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  });
  return obj;
}
