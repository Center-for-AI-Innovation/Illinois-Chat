import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    handlePdf,
    ingestPdfUrl,
    isPdfLink,
    postIngest,
    sanitizePdfFilename,
} from '../src/api/ingestClient.js';

interface Call {
    url: string;
    init: RequestInit;
}

const realFetch = globalThis.fetch;
const realEnv = { INGEST_URL: process.env.INGEST_URL, INGEST_API_KEY: process.env.INGEST_API_KEY };

let calls: Call[] = [];

function stubFetch(response: { ok?: boolean; status?: number; text?: string } = {}) {
    calls = [];
    globalThis.fetch = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return {
            ok: response.ok ?? true,
            status: response.status ?? 200,
            text: async () => response.text ?? '',
        };
    }) as unknown as typeof fetch;
}

function body(call: Call): Record<string, unknown> {
    return JSON.parse(String(call.init.body));
}

function headers(call: Call): Record<string, string> {
    return (call.init.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
    process.env.INGEST_URL = 'http://backend:8001/ingest';
    delete process.env.INGEST_API_KEY;
    stubFetch();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(realEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

describe('postIngest', () => {
    it('posts JSON to INGEST_URL', async () => {
        const ok = await postIngest({ course_name: 'CS 101', url: 'https://x.edu/a.pdf' });
        assert.equal(ok, true);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.url, 'http://backend:8001/ingest');
        assert.equal(calls[0]!.init.method, 'POST');
        assert.equal(headers(calls[0]!)['Content-Type'], 'application/json');
        assert.equal(body(calls[0]!).course_name, 'CS 101');
    });

    it('omits Authorization when INGEST_API_KEY is unset', async () => {
        await postIngest({ course_name: 'CS 101' });
        assert.equal(headers(calls[0]!).Authorization, undefined);
    });

    it('sends Authorization when INGEST_API_KEY is set', async () => {
        process.env.INGEST_API_KEY = 'ingest-secret';
        await postIngest({ course_name: 'CS 101' });
        assert.equal(headers(calls[0]!).Authorization, 'Bearer ingest-secret');
    });

    it('returns false and logs when INGEST_URL is missing', async () => {
        delete process.env.INGEST_URL;
        assert.equal(await postIngest({ course_name: 'CS 101' }), false);
        assert.equal(calls.length, 0);
    });

    it('reports a non-2xx response with its status and a body prefix', async () => {
        const logged: string[] = [];
        const realError = console.error;
        console.error = (msg: unknown) => logged.push(String(msg));
        stubFetch({ ok: false, status: 401, text: 'x'.repeat(900) });
        try {
            assert.equal(await postIngest({ course_name: 'CS 101', url: 'https://x.edu/a.pdf' }), false);
        } finally {
            console.error = realError;
        }
        assert.equal(logged.length, 1);
        assert.match(logged[0]!, /^INGEST-FAILED status=401 url=https:\/\/x\.edu\/a\.pdf body=x{500}$/);
    });

    it('returns false when fetch itself throws', async () => {
        const realError = console.error;
        console.error = () => {};
        globalThis.fetch = (async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch;
        try {
            assert.equal(await postIngest({ course_name: 'CS 101' }), false);
        } finally {
            console.error = realError;
        }
    });
});

describe('ingestPdfUrl', () => {
    it('sends fetch_from_url with no s3_paths and no content', async () => {
        await ingestPdfUrl('CS 101', 'https://x.edu/docs', 'https://x.edu/docs/Student%20Handbook.pdf', ['docs']);
        const sent = body(calls[0]!);
        assert.equal(sent.fetch_from_url, true);
        assert.equal(sent.url, 'https://x.edu/docs/Student%20Handbook.pdf');
        assert.equal(sent.base_url, 'https://x.edu/docs');
        assert.equal(sent.course_name, 'CS 101');
        assert.deepEqual(sent.groups, ['docs']);
        // Same fixture as the worker's Python sanitize_pdf_filename test.
        assert.equal(sent.readable_filename, 'Student-Handbook.pdf');
        assert.equal('s3_paths' in sent, false);
        assert.equal('content' in sent, false);
    });
});

describe('handlePdf', () => {
    it('posts once for a PDF linked from many pages', async () => {
        const seen = new Set<string>();
        await handlePdf(seen, 'CS 101', 'https://x.edu', 'https://x.edu/handbook.pdf', []);
        await handlePdf(seen, 'CS 101', 'https://x.edu', 'https://x.edu/handbook.pdf', []);
        await handlePdf(seen, 'CS 101', 'https://x.edu', 'https://x.edu/handbook.pdf', []);
        assert.equal(calls.length, 1);
    });

    it('dedups before awaiting, so concurrent callers cannot both pass', async () => {
        const seen = new Set<string>();
        await Promise.all([
            handlePdf(seen, 'CS 101', 'https://x.edu', 'https://x.edu/handbook.pdf', []),
            handlePdf(seen, 'CS 101', 'https://x.edu', 'https://x.edu/handbook.pdf', []),
        ]);
        assert.equal(calls.length, 1);
    });

    it('still posts distinct PDFs', async () => {
        const seen = new Set<string>();
        await handlePdf(seen, 'CS 101', 'https://x.edu', 'https://x.edu/a.pdf', []);
        await handlePdf(seen, 'CS 101', 'https://x.edu', 'https://x.edu/b.pdf', []);
        assert.equal(calls.length, 2);
    });
});

describe('isPdfLink', () => {
    const cases: [string, boolean][] = [
        ['https://x.edu/a.pdf', true],
        ['https://x.edu/A.PDF', true],
        ['https://x.edu/a.pdf?dl=1', true],
        ['https://x.edu/a.pdf#page=2', true],
        ['https://x.edu/a.html', false],
        ['https://x.edu/a.pdf.zip', false],
        ['https://x.edu/pdf', false],
        ['https://x.edu/?file=a.pdf', false],
        ['not a url', false],
        ['', false],
    ];

    for (const [url, expected] of cases) {
        it(`${JSON.stringify(url)} -> ${expected}`, () => {
            assert.equal(isPdfLink(url), expected);
        });
    }
});

describe('sanitizePdfFilename', () => {
    // Identical fixtures to apps/backend/tests/test_url_download.py so the name the
    // crawler reports matches the one the worker derives for the S3 key.
    const cases: [string, string][] = [
        ['https://x.edu/docs/Student%20Handbook.pdf', 'Student-Handbook.pdf'],
        ['https://x.edu/docs/REPORT.PDF', 'REPORT.pdf'],
        ['https://x.edu/docs/handbook.pdf?version=2&dl=1', 'handbook.pdf'],
        ['https://x.edu/docs/handbook.pdf#page=4', 'handbook.pdf'],
        ['https://x.edu/docs/no-extension', 'no-extension.pdf'],
        ['https://x.edu/docs/a__b--c.pdf', 'a-b-c.pdf'],
        ['https://x.edu/', 'document.pdf'],
        ['https://x.edu', 'document.pdf'],
        ['https://x.edu/docs/---.pdf', 'document.pdf'],
        ['not a url', 'document.pdf'],
    ];

    for (const [url, expected] of cases) {
        it(`${url} -> ${expected}`, () => {
            assert.equal(sanitizePdfFilename(url), expected);
        });
    }

    it('caps long names', () => {
        const name = sanitizePdfFilename(`https://x.edu/${'a'.repeat(300)}.pdf`);
        assert.ok(name.length <= 200);
        assert.ok(name.endsWith('.pdf'));
    });
});
