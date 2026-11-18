// Run with `npm test` (node:test through tsx). Not part of the build: tsconfig.json excludes it.
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createRequire } from 'node:module';
import { log, LogLevel } from 'crawlee';
import { callSite, CrawlerLogger, finishLine, hidePasswords, installProcessHandlers, oneLine } from './logSetup.js';

// The tests read WARN and INFO lines, so they must not depend on LOG_LEVEL (logSetup.ts
// reads it from the environment and from apps/crawlee/.env).
log.setLevel(LogLevel.DEBUG);

// What the logger sent to the console, one string per call, without colour codes.
function capture(method: 'log' | 'warn' | 'error'): string[] {
    const lines: string[] = [];
    mock.method(console, method, (line: string) => {
        // eslint-disable-next-line no-control-regex
        lines.push(String(line).replace(/\u001b\[[0-9;]*m/g, ''));
    });
    return lines;
}

afterEach(() => mock.restoreAll());

describe('hidePasswords', () => {
    it('hides the password of a URL and leaves other URLs as they are', () => {
        assert.equal(hidePasswords('url=https://user:secret@example.edu/a?b=1'), 'url=https://***@example.edu/a?b=1');
        assert.equal(hidePasswords('redis://default:pw@redis:6379 and amqp://g:g@mq/'), 'redis://***@redis:6379 and amqp://***@mq/');
        assert.equal(hidePasswords('url=https://example.edu:8443/a@b'), 'url=https://example.edu:8443/a@b');
        assert.equal(hidePasswords('mail=a.b@illinois.edu at=src/main.ts:82'), 'mail=a.b@illinois.edu at=src/main.ts:82');
    });

    it('hides a login with no user, a token as the user, and a password with an @ in it', () => {
        assert.equal(hidePasswords('redis://:secret@redis:6379/0'), 'redis://***@redis:6379/0');
        assert.equal(hidePasswords('https://token123@github.com/x'), 'https://***@github.com/x');
        assert.equal(hidePasswords('https://user:p@ss@host/x'), 'https://***@host/x');
    });

    it('does not eat text after a URL that has a port and no path', () => {
        const json = '{"url":"http://x.com:80","mail":"u@v.edu"}';
        assert.equal(hidePasswords(json), json);
        assert.equal(hidePasswords('https://example.edu:8443?next=a@b'), 'https://example.edu:8443?next=a@b');
        assert.equal(hidePasswords('see https://a.edu:8443,contact:bob@y.edu'), 'see https://a.edu:8443,contact:bob@y.edu');
        assert.equal(hidePasswords('https://a.edu:8443#x@y'), 'https://a.edu:8443#x@y');
    });
});

describe('callSite', () => {
    const LOGGER_FRAMES = [
        '    at CrawlerLogger._outputWithConsole (file:///app/dist/logSetup.js:70:24)',
        '    at CrawlerLogger._log (/app/node_modules/@apify/log/cjs/index.cjs:402:10)',
        '    at CrawlerLogger._log (file:///app/dist/logSetup.js:59:22)',
        '    at CrawlerLogger.log (/app/node_modules/@apify/log/cjs/index.cjs:273:23)',
        '    at _Log.internal (/app/node_modules/@apify/log/cjs/index.cjs:554:25)',
        '    at _Log.error (/app/node_modules/@apify/log/cjs/index.cjs:593:10)',
    ];
    const stack = (...callers: string[]) => ['Error', ...LOGGER_FRAMES, ...callers].join('\n');

    it('names the source file and line of the caller', () => {
        assert.equal(callSite(stack('    at file:///home/myuser/src/main.ts:82:18')), 'src/main.ts:82');
        assert.equal(callSite(stack('    at async handlePdf (/home/myuser/src/api/crawlee.ts:357:10)')), 'src/api/crawlee.ts:357');
    });

    it('names the built file when there are no source maps', () => {
        assert.equal(callSite(stack('    at file:///home/myuser/dist/main.js:72:18')), 'dist/main.js:72');
    });

    it('reads the frames of @apify/log as --enable-source-maps writes them', () => {
        const mapped = [
            'Error',
            '    at CrawlerLogger._outputWithConsole (/app/src/logSetup.ts:79:24)',
            '    at CrawlerLogger._log (/app/node_modules/@apify/src/logger_text.ts:60:14)',
            '    at CrawlerLogger._log (/app/src/logSetup.ts:73:22)',
            '    at CrawlerLogger.log (/app/node_modules/@apify/src/logger.ts:47:27)',
            '    at _Log.internal (/app/node_modules/@apify/src/log.ts:226:29)',
            '    at _Log.exception (/app/node_modules/@apify/src/log.ts:284:14)',
            '    at /app/src/main.ts:84:18',
        ].join('\n');
        assert.equal(callSite(mapped), 'src/main.ts:84');
    });

    it('does not take a class of the app that is named Logger for the logger', () => {
        // The log.error call is in Logger.go of the app; that line is the caller.
        assert.equal(callSite(stack('    at Logger.go (/home/myuser/src/api/thing.ts:35:13)', '    at run (/home/myuser/src/main.ts:36:5)')), 'src/api/thing.ts:35');
    });

    it('gives nothing when a package or Node itself wrote the line', () => {
        assert.equal(callSite(stack('    at PlaywrightCrawler._requestFunctionErrorHandler (/app/node_modules/@crawlee/basic/internals/basic-crawler.js:1100:26)', '    at file:///app/dist/api/crawlee.js:200:5')), undefined);
        assert.equal(callSite(stack('    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)')), undefined);
        assert.equal(callSite('Error\n    at somewhere (/app/dist/main.js:1:1)'), undefined);
        assert.equal(callSite(''), undefined);
    });
});

describe('the logger', () => {
    it('ends an ERROR line with the line that logged it, and no other level', () => {
        const errors = capture('error');
        const warnings = capture('warn');
        const child = log.child({ prefix: 'rid=abc123 course=ece120' });
        child.error('ingest failed url=https://ece.illinois.edu/a');
        child.warning('page failed');
        assert.equal(errors.length, 1);
        assert.match(errors[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} ERROR rid=abc123 course=ece120: ingest failed url=https:\/\/ece\.illinois\.edu\/a at=src\/logSetup\.test\.ts:\d+$/);
        assert.equal(warnings.length, 1);
        assert.doesNotMatch(warnings[0], / at=/);
    });

    it('puts at= on the first line when a stack follows', () => {
        const errors = capture('error');
        log.exception(new Error('boom'), 'crawl failed ms=12');
        const lines = errors[0].split('\n');
        assert.match(lines[0], / ERROR crawl failed ms=12 at=src\/logSetup\.test\.ts:\d+$/);
        assert.ok(lines.length > 2);
        assert.match(lines[1], /boom/);
        assert.match(lines[2], /^\s+at /);
    });

    it('hides a URL password in the message, the data and the error', () => {
        const errors = capture('error');
        const infos = capture('log');
        log.info('crawl started url=https://user:secret@example.edu/', { next: 'http://a:b@c.edu/x' });
        log.exception(new Error('page.goto failed at http://user:secret@example.edu/'), 'page failed');
        assert.match(infos[0], /url=https:\/\/\*\*\*@example\.edu\/ \{"next":"http:\/\/\*\*\*@c\.edu\/x"\}$/);
        assert.match(errors[0], /http:\/\/\*\*\*@example\.edu\//);
        assert.doesNotMatch(infos[0] + errors[0], /secret|a:b@/);
    });

    it('keeps a message on one line, but leaves stack frames in a message on their own lines', () => {
        const warnings = capture('warn');
        log.warning('Reclaiming failed request. page.goto: failed\nCall log:\n  - navigating\n');
        assert.match(warnings[0], /page\.goto: failed\\nCall log:\\n {2}- navigating\\n$/);
        assert.equal(warnings[0].includes('\n'), false);

        const errors = capture('error');
        log.error('Request failed and reached maximum retries. Error: x\n\n    at goto (/app/node_modules/a.js:1:2)\n    at run (/app/node_modules/b.js:3:4)');
        assert.deepEqual(errors[0].split('\n').slice(1), ['    at goto (/app/node_modules/a.js:1:2)', '    at run (/app/node_modules/b.js:3:4)']);
    });

    it('oneLine keeps a value on one line and escapes control characters', () => {
        assert.equal(oneLine('a\r\nb\nc\rd'), 'a\\nb\\nc\\nd');
        assert.equal(oneLine('a\u0000b\tc\u001b[31md\u2028e\u007f'), 'a\\x00b\\tc\\x1b[31md\\u2028e\\x7f');
    });

    it('does not let a NUL or another control character in a message start a new line', () => {
        const infos = capture('log');
        log.info('crawl started url=http://x\u00002026-11-03 00:00:00.000 ERROR rid=zzz: FORGED\u2028next\u0085more');
        assert.equal(infos.length, 1);
        assert.equal(/[\n\u0000\u2028\u0085]/.test(infos[0]), false);
        assert.match(infos[0], /url=http:\/\/x\\x002026-11-03 00:00:00\.000 ERROR rid=zzz: FORGED\\u2028next\\x85more$/);
    });

    it('keeps the message of an error on one line, also when it has several lines', () => {
        const errors = capture('error');
        log.exception(new Error('page.goto: failed\nCall log:\n  - navigating\n2026-11-03 00:00:00.000 INFO  FORGED'), 'crawl failed');
        const lines = errors[0].split('\n');
        assert.match(lines[0], / ERROR crawl failed at=src\/logSetup\.test\.ts:\d+$/);
        // Every other line is the error message (indented) or a stack frame.
        for (const line of lines.slice(1)) assert.match(line, /^\s+\S/);
        assert.match(lines[1], /^\s+page\.goto: failed\\nCall log:\\n {2}- navigating\\n2026-11-03 00:00:00\.000 INFO {2}FORGED/);
        assert.ok(lines.slice(2).every((line) => /^\s+(at |CAUSE: )/.test(line)));

        log.exception('a string\n2026-11-03 00:00:00.000 INFO  FORGED' as unknown as Error, 'odd error');
        assert.equal(errors[1].includes('\n'), false);
    });

    it('cuts a very long message', () => {
        const infos = capture('log');
        log.info(`url=${'a'.repeat(50_000)}`);
        assert.ok(infos[0].length < 10_200);
        assert.match(infos[0], /\.\.\.\[cut 40004 characters\]$/);
    });

    it('gives the listener of the line event the same text as the console', () => {
        const errors = capture('error');
        const logger = log.getOptions().logger as CrawlerLogger;
        const seen: string[] = [];
        const onLine = (line: string) => seen.push(line.replace(/\u001b\[[0-9;]*m/g, ''));
        logger.on('line', onLine);
        try {
            log.error('failed url=http://u:pw@h/');
        } finally {
            logger.off('line', onLine);
        }
        assert.equal(seen[0], errors[0]);
        assert.match(seen[0], /url=http:\/\/\*\*\*@h\/ at=src\/logSetup\.test\.ts:\d+$/);
    });

    it('also formats the loggers that crawlee made when it was imported', () => {
        // @crawlee/browser-pool makes its logger at import time, before logSetup.ts ran.
        const require = createRequire(import.meta.url);
        // The package does not export the file, so it is loaded by its path.
        const { log: browserPoolLog } = require(require.resolve('@crawlee/browser-pool').replace(/index\.js$/, 'logger.js'));
        assert.ok(browserPoolLog.getOptions().logger instanceof CrawlerLogger);
        const errors = capture('error');
        browserPoolLog.error('Could not close browser\nCause: x http://u:pw@h/');
        assert.match(errors[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} ERROR BrowserPool: Could not close browser\\nCause: x http:\/\/\*\*\*@h\/ at=src\/logSetup\.test\.ts:\d+$/);
    });
});

describe('finishLine', () => {
    it('keeps stack lines, folds every other line, and puts at= on the first line', () => {
        const line = ['ERROR head', '  Error message', 'second message line', '      at run (/app/a.js:1:2)', '    CAUSE: inner', 'stray'].join('\n');
        assert.equal(finishLine(line, true, 'src/main.ts:5'), ['ERROR head at=src/main.ts:5', '  Error message\\nsecond message line', '      at run (/app/a.js:1:2)', '    CAUSE: inner\\nstray'].join('\n'));
        assert.equal(finishLine('WARN x\nnot indented', false), 'WARN x\\nnot indented');
    });
});

describe('installProcessHandlers', () => {
    it('writes a warning and an uncaught error through the logger, then stops with code 1', async () => {
        const before = {
            warning: process.listeners('warning'),
            uncaughtException: process.listeners('uncaughtException'),
            unhandledRejection: process.listeners('unhandledRejection'),
        };
        const exits: number[] = [];
        installProcessHandlers((code) => exits.push(code));
        const added = (name: 'warning' | 'uncaughtException' | 'unhandledRejection') =>
            (process.listeners(name) as Array<(...args: any[]) => void>).filter((fn) => !(before[name] as unknown[]).includes(fn));
        try {
            const warnings = capture('warn');
            const errors = capture('error');

            added('warning').forEach((fn) => fn(Object.assign(new Error('TLS check is off'), { name: 'Warning' })));
            assert.match(warnings[0], / WARN {2}Warning: TLS check is off$/);
            added('warning').forEach((fn) => fn(Object.assign(new Error('old api'), { name: 'DeprecationWarning', code: 'DEP0999' })));
            assert.match(warnings[1], / WARN {2}DeprecationWarning \[DEP0999\]: old api$/);
            assert.equal(exits.length, 0);

            added('uncaughtException').forEach((fn) => fn(new Error('kaput')));
            assert.match(errors[0].split('\n')[0], / ERROR uncaught exception, the crawler stops at=src\/logSetup\.ts:\d+$/);
            assert.match(errors[0], /kaput/);

            added('unhandledRejection').forEach((fn) => fn('just a string'));
            assert.match(errors[1].split('\n')[0], / ERROR unhandled promise rejection, the crawler stops at=src\/logSetup\.ts:\d+$/);
            assert.match(errors[1], /just a string/);
            // The exit waits until stderr has taken the line.
            for (let i = 0; i < 100 && exits.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 10));
            assert.deepEqual(exits, [1, 1]);
        } finally {
            for (const name of ['warning', 'uncaughtException', 'unhandledRejection'] as const) {
                added(name).forEach((fn) => process.removeListener(name, fn));
                // installProcessHandlers removed Node's own warning listener: put it back.
                (before[name] as Array<(...args: any[]) => void>).forEach((fn) => { if (!process.listeners(name).includes(fn as any)) process.on(name, fn); });
            }
        }
    });
});
