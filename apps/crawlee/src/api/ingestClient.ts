/**
 * The crawler's only outbound channel: POST /ingest on the backend.
 *
 * The crawler used to upload crawled PDFs to S3 itself, with a global client and
 * an env-configured bucket. Projects that bring their own S3 made that wrong —
 * the ingest worker reads from the project's bucket, so the object was written
 * somewhere nobody looked. The crawler now reports the URL and nothing else; the
 * worker downloads the PDF and writes it to the bucket it already resolved. That
 * also means the crawler holds no tenant credentials at all.
 */

const MAX_FILENAME_LENGTH = 200;
const DEFAULT_FILENAME = 'document.pdf';

export interface IngestBody {
    course_name: string;
    base_url?: string;
    url?: string;
    readable_filename?: string;
    groups?: string[];
    /** Web-page text. Mutually exclusive with fetch_from_url. */
    content?: string;
    /** Tells the worker to download `url` itself and store it in the project's bucket. */
    fetch_from_url?: boolean;
}

/**
 * POST one job to the ingest queue. Returns false (already logged) on any failure,
 * so a single bad document never aborts a crawl.
 */
export async function postIngest(body: IngestBody): Promise<boolean> {
    const ingestUrl = process.env.INGEST_URL;
    if (!ingestUrl) {
        console.error('Error: INGEST_URL environment variable is not defined.');
        return false;
    }

    const headers: Record<string, string> = {
        Accept: '*/*',
        'Content-Type': 'application/json',
    };
    // Optional on the backend, which fails open when the var is unset. Sending it
    // only when we have it keeps an un-upgraded deployment working.
    if (process.env.INGEST_API_KEY) {
        headers.Authorization = `Bearer ${process.env.INGEST_API_KEY}`;
    }

    try {
        const response = await fetch(ingestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let text = '';
            try {
                text = await response.text();
            } catch {
                text = '<unreadable body>';
            }
            console.error(
                `INGEST-FAILED status=${response.status} url=${body.url ?? 'n/a'} body=${text.slice(0, 500)}`,
            );
            return false;
        }
        return true;
    } catch (error) {
        console.error(`INGEST-FAILED status=n/a url=${body.url ?? 'n/a'} body=${String(error).slice(0, 500)}`);
        return false;
    }
}

/** True when the URL's *path* ends in .pdf, case-insensitively and ignoring any query or fragment. */
export function isPdfLink(url: string): boolean {
    try {
        return new URL(url).pathname.toLowerCase().endsWith('.pdf');
    } catch {
        return false;
    }
}

/**
 * Derive a safe, readable `.pdf` filename from a URL.
 *
 * Mirrors the worker's Python `sanitize_pdf_filename` exactly — both are covered by
 * the same fixtures — so the name the crawler reports matches the one the worker
 * would derive on its own.
 */
export function sanitizePdfFilename(url: string): string {
    let pathname = '';
    try {
        pathname = new URL(url).pathname;
    } catch {
        pathname = '';
    }

    const basename = pathname.split('/').pop() ?? '';
    let rawName = basename;
    try {
        rawName = decodeURIComponent(basename);
    } catch {
        // Malformed percent-escape: keep the raw form, the sanitiser handles it.
    }

    // Strip the final extension, but only when something precedes the dot, so
    // a dotfile keeps its name (matching Python's PurePosixPath(...).stem).
    const stemMatch = /^(.+)\.[^.]*$/.exec(rawName);
    const stem = stemMatch ? (stemMatch[1] as string) : rawName;

    const cleaned = stem
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!cleaned) {
        return DEFAULT_FILENAME;
    }
    return `${cleaned.slice(0, MAX_FILENAME_LENGTH - '.pdf'.length)}.pdf`;
}

/** Queue a crawled PDF for the worker to fetch. Carries no s3_paths and no content. */
export async function ingestPdfUrl(
    courseName: string,
    base_url: string,
    url: string,
    documentGroups: string[],
): Promise<boolean> {
    return postIngest({
        course_name: courseName,
        base_url,
        url,
        readable_filename: sanitizePdfFilename(url),
        groups: documentGroups,
        fetch_from_url: true,
    });
}

/**
 * Enqueue a PDF once per crawl.
 *
 * A site-wide handbook is linked from every page, so without this a single crawl
 * would enqueue the same PDF dozens of times. The check and the add are the first
 * two synchronous statements, before any await, so concurrent callers cannot both
 * pass. Dedup *across* crawls is the worker's exact-URL documents check.
 */
export async function handlePdf(
    seenPdfUrls: Set<string>,
    courseName: string,
    base_url: string,
    url: string,
    documentGroups: string[],
): Promise<void> {
    if (seenPdfUrls.has(url)) {
        return;
    }
    seenPdfUrls.add(url);

    try {
        await ingestPdfUrl(courseName, base_url, url, documentGroups);
    } catch (error) {
        console.error(`Error in handlePdf: ${error}`);
    }
}
