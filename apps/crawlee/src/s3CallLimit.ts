// One time limit for a whole call to S3.
//
// crawl() waits for every PDF before /crawl answers, and a PDF waits for its S3 calls.
// The client makes 3 tries, and its idle limit does not count a reply that starts and then
// stops. So each call also has one limit for all its tries together. It is long, because
// it also ends an upload of 100 MB that is slow but makes progress.
export const S3_CALL_TIMEOUT_MS = 10 * 60_000;

// Runs one S3 call with that limit. The signal makes the client stop its work. The race
// makes the limit hard: for a reply that starts and never ends, the client does not settle
// its promise when the signal fires, and crawl() would wait for it with no end.
export function withS3CallLimit<T>(
  call: (options: { abortSignal: AbortSignal }) => Promise<T>,
  limitMs: number = S3_CALL_TIMEOUT_MS,
): Promise<T> {
  const signal = AbortSignal.timeout(limitMs);
  const limit = new Promise<never>((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new Error(`the S3 call hit the time limit of ${limitMs / 1000} s`)),
      { once: true },
    );
  });
  return Promise.race([call({ abortSignal: signal }), limit]);
}
