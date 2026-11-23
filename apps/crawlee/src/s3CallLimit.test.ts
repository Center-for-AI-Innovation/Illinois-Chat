import assert from 'node:assert/strict';
import { test } from 'node:test';
import { S3_CALL_TIMEOUT_MS, withS3CallLimit } from './s3CallLimit.js';

test('a call that ends in time gives its result', async () => {
    assert.equal(await withS3CallLimit(async () => 'done', 1000), 'done');
});

test('a call that fails in time gives its own error', async () => {
    const notFound = Object.assign(new Error('no such bucket'), { name: 'NotFound' });
    await assert.rejects(withS3CallLimit(() => Promise.reject(notFound), 1000), (error: unknown) => error === notFound);
});

test('a call that never ends fails at the limit, also when it does not react to the signal', async () => {
    let signal: AbortSignal | undefined;
    const started = Date.now();
    // The S3 client does this for a reply that starts and never ends: its promise stays open
    // after the signal fired.
    const never = withS3CallLimit((options) => {
        signal = options.abortSignal;
        return new Promise<string>(() => {});
    }, 100);
    await assert.rejects(never, /^Error: the S3 call hit the time limit of 0\.1 s$/);
    assert.ok(Date.now() - started < 3000);
    // The client also got the signal, so it stops its own work.
    assert.equal(signal?.aborted, true);
});

test('a result that comes after the limit is not an unhandled rejection', async () => {
    let fail: (error: Error) => void = () => {};
    const late = withS3CallLimit(() => new Promise<string>((_, reject) => { fail = reject; }), 50);
    await assert.rejects(late, /time limit/);
    // The call fails after the limit. Node ends the test run for a rejection that nothing handles.
    fail(new Error('socket hang up'));
    await new Promise((resolve) => setTimeout(resolve, 50));
});

test('a call that throws at once is a rejection, and its timer does not stay', async () => {
    const boom = new Error('bad input');
    await assert.rejects(withS3CallLimit(() => { throw boom; }, 60_000), (error: unknown) => error === boom);
    // With a timer of 60 seconds left behind, this test file would not end in time.
});

test('the signal is not aborted when the call ends in time', async () => {
    let signal: AbortSignal | undefined;
    await withS3CallLimit(async (options) => { signal = options.abortSignal; }, 50);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(signal?.aborted, false);
});

test('the limit of a call is 10 minutes', () => {
    assert.equal(S3_CALL_TIMEOUT_MS, 600_000);
});
