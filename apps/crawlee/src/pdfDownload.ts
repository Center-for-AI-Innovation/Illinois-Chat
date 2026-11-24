// The download of one PDF, with a time limit.
//
// crawl() waits for every PDF before /crawl answers. Without this limit, a server that
// accepts the connection and never ends its reply would keep /crawl open with no end.
//
// There is no size limit: a PDF of any size is read, as it was before this file. A size
// limit would make large files fail that are ingested today.
import axios from 'axios';

/** The longest that one download may take, from the first step to the last byte. */
export const PDF_DOWNLOAD_TIMEOUT_MS = 120_000;

export interface PdfDownload {
    data: Buffer;
    /** The Content-Type header in lower case, or '' when the reply has none. */
    contentType: string;
}

/** A download that failed. `limit` is 'time' when the time limit is the cause. */
export class PdfDownloadError extends Error {
    readonly limit?: 'time';
    /** The error from axios. */
    readonly cause?: unknown;

    constructor(message: string, limit?: 'time', cause?: unknown) {
        super(message);
        this.name = 'PdfDownloadError';
        this.limit = limit;
        this.cause = cause;
    }
}

// Every failure is a PdfDownloadError, so the caller can tell a failed download from a
// failed upload. The message has no URL: the caller writes it in its log line.
export async function downloadPdf(url: string, timeoutMs: number = PDF_DOWNLOAD_TIMEOUT_MS): Promise<PdfDownload> {
    // The hard limit for the whole download. The axios `timeout` below only counts the time
    // with no data, so it does not stop a reply that sends a few bytes now and then.
    const signal = AbortSignal.timeout(timeoutMs);
    try {
        const response = await axios.get<Buffer>(url, {
            responseType: 'arraybuffer',
            timeout: timeoutMs,
            signal,
        });
        return {
            data: response.data,
            contentType: String(response.headers['content-type'] || '').toLowerCase(),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const axiosTimeout = axios.isAxiosError(error) && error.code === 'ECONNABORTED' && message.startsWith('timeout of');
        if (signal.aborted || axiosTimeout) {
            throw new PdfDownloadError(`hit the time limit of ${timeoutMs / 1000} s`, 'time', error);
        }
        // A connect failure to a host with more than one address is an AggregateError with
        // an empty message. Its code (ECONNREFUSED, ETIMEDOUT) is then the only reason.
        const code = (error as { code?: unknown } | null)?.code;
        const reason = typeof code === 'string' && !String(error).includes(code) ? `${error} (${code})` : String(error);
        throw new PdfDownloadError(reason, undefined, error);
    }
}
