// The limits of the PDF download, against local servers that behave badly.
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import { downloadPdf, PDF_DOWNLOAD_MAX_BYTES, PDF_DOWNLOAD_TIMEOUT_MS, PdfDownloadError } from './pdfDownload.js';

const servers: http.Server[] = [];
const timers: NodeJS.Timeout[] = [];

// Starts a server on a free local port and gives the URL of a file on it.
async function serve(handler: http.RequestListener): Promise<string> {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/file.pdf`;
}

after(() => {
    timers.forEach(clearInterval);
    for (const server of servers) {
        // Some of these servers never end their reply, so their connections are cut.
        server.closeAllConnections();
        server.close();
    }
});

// The error of a download that must fail, and the time it took.
async function failure(url: string, limits: { timeoutMs: number; maxBytes: number }): Promise<{ error: PdfDownloadError; ms: number }> {
    const started = Date.now();
    try {
        await downloadPdf(url, limits);
    } catch (error) {
        assert.ok(error instanceof PdfDownloadError, `not a PdfDownloadError: ${String(error)}`);
        return { error, ms: Date.now() - started };
    }
    return assert.fail('the download did not fail');
}

describe('downloadPdf', () => {
    it('gives the bytes and the content type of a reply inside the limits', async () => {
        const url = await serve((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'Application/PDF' });
            res.end('%PDF-1.7 small file');
        });
        const { data, contentType } = await downloadPdf(url, { timeoutMs: 5000, maxBytes: 1000 });
        assert.equal(data.toString('latin1'), '%PDF-1.7 small file');
        assert.equal(contentType, 'application/pdf');
    });

    it('has a time limit of 120 seconds and a size limit of 100 MB when the caller gives none', () => {
        assert.equal(PDF_DOWNLOAD_TIMEOUT_MS, 120_000);
        assert.equal(PDF_DOWNLOAD_MAX_BYTES, 104_857_600);
    });

    it('fails at the time limit when the server takes the request and never answers', async () => {
        const url = await serve(() => {});
        const { error, ms } = await failure(url, { timeoutMs: 300, maxBytes: 1000 });
        assert.equal(error.limit, 'time');
        assert.equal(error.message, 'hit the time limit of 0.3 s');
        assert.ok(ms < 3000, `took ${ms} ms`);
    });

    it('fails at the time limit when the reply starts and never ends', async () => {
        const url = await serve((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/pdf' });
            res.write('%PDF-1.7');
        });
        const { error, ms } = await failure(url, { timeoutMs: 300, maxBytes: 1000 });
        assert.equal(error.limit, 'time');
        assert.ok(ms < 3000, `took ${ms} ms`);
    });

    it('fails at the time limit when the reply sends a byte now and then with no end', async () => {
        // The time with no data never gets to the limit here: only the limit for the
        // whole download ends this one.
        const url = await serve((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/pdf' });
            timers.push(setInterval(() => res.write('x'), 20));
        });
        const { error, ms } = await failure(url, { timeoutMs: 300, maxBytes: 100_000 });
        assert.equal(error.limit, 'time');
        assert.ok(ms < 3000, `took ${ms} ms`);
    });

    it('fails at the size limit when the reply has more bytes than the limit', async () => {
        const url = await serve((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/pdf' });
            res.end(Buffer.alloc(5000, 'x'));
        });
        const { error } = await failure(url, { timeoutMs: 5000, maxBytes: 1000 });
        assert.equal(error.limit, 'size');
        assert.equal(error.message, 'hit the size limit of 1000 bytes');
    });

    it('stops reading at the size limit when the reply has no end', async () => {
        const chunk = Buffer.alloc(64 * 1024, 'x');
        let sent = 0;
        const url = await serve((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/pdf' });
            timers.push(
                setInterval(() => {
                    if (res.destroyed) return;
                    res.write(chunk);
                    sent += chunk.length;
                }, 1),
            );
        });
        const { error, ms } = await failure(url, { timeoutMs: 10_000, maxBytes: 1024 * 1024 });
        assert.equal(error.limit, 'size');
        assert.equal(error.message, 'hit the size limit of 1 MB');
        // It ended at the size limit, a long time before the time limit.
        assert.ok(ms < 5000, `took ${ms} ms`);
        assert.ok(sent < 50 * 1024 * 1024, `the server sent ${sent} bytes`);
    });

    it('gives a failure with no limit, and the cause, for a reply that is an error', async () => {
        const url = await serve((_req, res) => {
            res.writeHead(404);
            res.end('not here');
        });
        const { error } = await failure(url, { timeoutMs: 5000, maxBytes: 1000 });
        assert.equal(error.limit, undefined);
        assert.match(error.message, /status code 404/);
        assert.equal((error.cause as { response?: { status?: number } }).response?.status, 404);
    });
});

it('a refused connection names its code, also when the message of the error is empty', async () => {
    // Port 1 on localhost refuses at once. With two addresses for localhost, the error is
    // an AggregateError whose message is empty, and only its code says what failed.
    await assert.rejects(downloadPdf('http://localhost:1/file.pdf'), (error: unknown) => {
        assert.ok(error instanceof PdfDownloadError);
        assert.equal(error.limit, undefined);
        assert.match(error.message, /ECONNREFUSED/);
        // The code is in the text one time.
        assert.equal(error.message.split('ECONNREFUSED').length, 2);
        return true;
    });
});
