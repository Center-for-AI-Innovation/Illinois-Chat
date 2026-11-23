// The download of one PDF, with a time limit and a size limit.
//
// crawl() waits for every PDF before /crawl answers. Without these limits, a server that
// accepts the connection and never ends its reply would keep /crawl open with no end, and a
// very large file would be read fully into memory.
import axios from 'axios';

/** The longest that one download may take, from the first step to the last byte. */
export const PDF_DOWNLOAD_TIMEOUT_MS = 120_000;
/** The largest file that is read. A longer reply is cut off, and the PDF fails. */
export const PDF_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;

export interface PdfDownloadLimits {
    timeoutMs: number;
    maxBytes: number;
}

export interface PdfDownload {
    data: Buffer;
    /** The Content-Type header in lower case, or '' when the reply has none. */
    contentType: string;
}

/** A download that failed. `limit` says which limit was hit, when that is the cause. */
export class PdfDownloadError extends Error {
    readonly limit?: 'time' | 'size';
    /** The error from axios. */
    readonly cause?: unknown;

    constructor(message: string, limit?: 'time' | 'size', cause?: unknown) {
        super(message);
        this.name = 'PdfDownloadError';
        this.limit = limit;
        this.cause = cause;
    }
}

const MEBIBYTE = 1024 * 1024;
const sizeText = (bytes: number) => (bytes % MEBIBYTE === 0 ? `${bytes / MEBIBYTE} MB` : `${bytes} bytes`);

// Every failure is a PdfDownloadError, so the caller can tell a failed download from a
// failed upload. The message has no URL: the caller writes it in its log line.
export async function downloadPdf(
    url: string,
    limits: PdfDownloadLimits = { timeoutMs: PDF_DOWNLOAD_TIMEOUT_MS, maxBytes: PDF_DOWNLOAD_MAX_BYTES },
): Promise<PdfDownload> {
    // The hard limit for the whole download. The axios `timeout` below only counts the time
    // with no data, so it does not stop a reply that sends a few bytes now and then.
    const signal = AbortSignal.timeout(limits.timeoutMs);
    try {
        const response = await axios.get<Buffer>(url, {
            responseType: 'arraybuffer',
            timeout: limits.timeoutMs,
            signal,
            maxContentLength: limits.maxBytes,
            maxBodyLength: limits.maxBytes,
        });
        return {
            data: response.data,
            contentType: String(response.headers['content-type'] || '').toLowerCase(),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const axiosTimeout = axios.isAxiosError(error) && error.code === 'ECONNABORTED' && message.startsWith('timeout of');
        if (signal.aborted || axiosTimeout) {
            throw new PdfDownloadError(`hit the time limit of ${limits.timeoutMs / 1000} s`, 'time', error);
        }
        // axios has no error code for this case, only the message.
        if (axios.isAxiosError(error) && message.startsWith('maxContentLength size of')) {
            throw new PdfDownloadError(`hit the size limit of ${sizeText(limits.maxBytes)}`, 'size', error);
        }
        // A connect failure to a host with more than one address is an AggregateError with
        // an empty message. Its code (ECONNREFUSED, ETIMEDOUT) is then the only reason.
        const code = (error as { code?: unknown } | null)?.code;
        const reason = typeof code === 'string' && !String(error).includes(code) ? `${error} (${code})` : String(error);
        throw new PdfDownloadError(reason, undefined, error);
    }
}
