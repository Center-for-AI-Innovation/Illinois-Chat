# Web Crawling Details

## Types of Crawls

**Limit Web Crawl Options:**

1. **Equal and Below:** This option restricts the scraping to pages whose URLs begin exactly with the specified starting point and includes any subsequent pages that follow this path. For example, choosing `nasa.gov/blogs` will target all blog entries (like `nasa.gov/blogs/new-rocket`), but it will not include unrelated paths such as `nasa.gov/events`. It's like following a branch on a tree without jumping to a different branch.
2. **Same Subdomain:** When you select this option, the scraper will focus on a specific subdomain, collecting data from all the pages within it. For instance, if you choose `docs.nasa.gov`, it will explore all the pages under this subdomain exclusively, ignoring pages on `nasa.gov` or other subdomains like `api.nasa.gov`. Imagine this as confining the scraping to a single section of a library.
3. **Entire Domain:** Opting for this allows the scraper to access all content under the main domain, including its subdomains. Selecting `nasa.gov` means it can traverse through `docs.nasa.gov`, `api.nasa.gov`, and any other subdomains present. Think of it as having a pass to explore every room in a building.
4. **All:** This is the most extensive scraping option, where the scraper begins at your specified URL and ventures out to any linked pages, potentially going beyond the initial domain. It's akin to setting out on a web expedition with no specific boundary.

**Recommendation:** Starting with the "Equal and Below" option is advisable for a focused and manageable scrape. If your needs expand, you can re-run the process with broader options as required.



## PDFs during crawling

The crawler does **not** download or store PDFs. When it finds a link whose path
ends in `.pdf`, it posts the URL to the backend's `/ingest` with
`fetch_from_url: true` and nothing else — no file body, no S3 key. The ingest
worker then fetches the PDF itself and uploads it to the S3 bucket it has already
resolved for that project.

This matters for projects that bring their own S3 bucket. The crawler used to
upload with a single env-configured bucket while the worker read from the
project's bucket, so those PDFs were written where nobody looked: ingest failed
and citation links 404'd. Now the process that writes the object is the process
that reads it back, so a mismatch is impossible.

What the worker does with the URL:

* Rejects anything that is not a plain public `http(s)` URL — no embedded
  credentials, ports other than 80/443, or hostnames that resolve to a private,
  loopback, link-local or otherwise non-routable address. Redirects are followed
  by hand, up to five hops, and re-checked at every hop.
* Streams the body with a **200 MiB** cap, aborting as soon as it is exceeded.
* Accepts the file only if it starts with `%PDF-` or is served as
  `application/pdf`.
* Stores it at `courses/{project}/{uuid}-{filename}.pdf`. **The bucket must
  already exist** — neither the crawler nor the worker creates buckets.
* Skips the download entirely when the project already has a document with
  exactly that URL.

A `.pdf` URL that actually serves an HTML page (common on sites that migrated
off PDFs) is logged as `SKIP-PDF-URL (not_a_pdf)` and produces no document and no
failure row, matching the behaviour before this change.

Every other failure lands in the failed-documents view with an error of the form
`PDF fetch failed (<reason>): <detail>`, where `<reason>` is one of
`blocked_url`, `too_large`, `too_many_redirects`, `http_<status>` or `network`.
A missing bucket instead produces an error naming the bucket and the project.

## Backend Code

Web crawling is powered by [Crawlee.dev](https://crawlee.dev/). Our implementation is [open source on Github](https://github.com/UIUC-Chatbot/crawlee).

Happily, I've seen web scraping take place at 10Gbps, using 6 cores of parallel javascript. It's a performant option even with basic hosting on [Railway.app](https://railway.app/). The baseline 100MB of memory usage costs $1/mo on Railway, pretty nifty.

<figure><img src="../.gitbook/assets/image (3).png" alt=""><figcaption></figcaption></figure>
