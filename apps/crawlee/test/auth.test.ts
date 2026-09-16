import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { requireCrawleeApiKey } from '../src/api/auth.js';

function makeRes() {
    const captured: { status?: number; body?: unknown } = {};
    const res = {
        status(code: number) {
            captured.status = code;
            return res;
        },
        json(body: unknown) {
            captured.body = body;
            return res;
        },
    };
    return { res, captured };
}

function run(authorization?: string) {
    const { res, captured } = makeRes();
    let nextCalled = false;
    requireCrawleeApiKey(
        { headers: authorization === undefined ? {} : { authorization } } as any,
        res as any,
        () => {
            nextCalled = true;
        },
    );
    return { captured, nextCalled };
}

const ORIGINAL_KEY = process.env.CRAWLEE_API_KEY;

afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
        delete process.env.CRAWLEE_API_KEY;
    } else {
        process.env.CRAWLEE_API_KEY = ORIGINAL_KEY;
    }
});

describe('requireCrawleeApiKey', () => {
    it('fails closed with 503 when CRAWLEE_API_KEY is unset', () => {
        delete process.env.CRAWLEE_API_KEY;
        const { captured, nextCalled } = run('Bearer anything');
        assert.equal(captured.status, 503);
        assert.equal(nextCalled, false);
    });

    it('rejects a request with no Authorization header', () => {
        process.env.CRAWLEE_API_KEY = 'secret-key';
        const { captured, nextCalled } = run(undefined);
        assert.equal(captured.status, 401);
        assert.equal(nextCalled, false);
    });

    it('rejects a wrong token', () => {
        process.env.CRAWLEE_API_KEY = 'secret-key';
        const { captured, nextCalled } = run('Bearer wrong-key');
        assert.equal(captured.status, 401);
        assert.equal(nextCalled, false);
    });

    it('rejects a token of a different length without throwing', () => {
        process.env.CRAWLEE_API_KEY = 'secret-key';
        const { captured, nextCalled } = run('Bearer x');
        assert.equal(captured.status, 401);
        assert.equal(nextCalled, false);
    });

    it('rejects a non-Bearer scheme carrying the right value', () => {
        process.env.CRAWLEE_API_KEY = 'secret-key';
        const { captured, nextCalled } = run('Basic secret-key');
        assert.equal(captured.status, 401);
        assert.equal(nextCalled, false);
    });

    it('calls next() for the right token', () => {
        process.env.CRAWLEE_API_KEY = 'secret-key';
        const { captured, nextCalled } = run('Bearer secret-key');
        assert.equal(captured.status, undefined);
        assert.equal(nextCalled, true);
    });
});
