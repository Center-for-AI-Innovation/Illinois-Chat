// Run with `npm test` (node:test through tsx). Not part of the build: tsconfig.json excludes it.
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { log, LogLevel } from 'crawlee';
import { execFile } from 'node:child_process';
import { callSite, crawlContext, CrawlerLogger, finishLine, hidePasswords, installProcessHandlers, oneLine } from './logSetup.js';

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

    it('hides a password that has punctuation in it', () => {
        assert.equal(hidePasswords('https://u:p,w@example.edu/'), 'https://***@example.edu/');
        assert.equal(hidePasswords("https://user:it's@host.edu/"), 'https://***@host.edu/');
        assert.equal(hidePasswords('redis://:p?ss@cache:6379 redis://:p#ss@cache:6379'), 'redis://***@cache:6379 redis://***@cache:6379');
        assert.equal(hidePasswords('https://user:p<a>ss@h https://u:8443@h/x'), 'https://***@h https://***@h/x');
        // A password that starts with digits is not read as a port.
        assert.equal(hidePasswords('postgres://admin:2024#Winter@db:5432/app redis://default:1234&abcd@cache:6379'), 'postgres://***@db:5432/app redis://***@cache:6379');
        // A browser reads this as a URL with a login.
        assert.equal(hidePasswords('http:///user:SECRETB@127.0.0.1:9/'), 'http://***@127.0.0.1:9/');
        assert.equal(hidePasswords('http:////user:SECR...[truncated]'), 'http://***...[truncated]');
    });

    it('hides a login whose user name has an @ or punctuation in it', () => {
        assert.equal(hidePasswords('https://bob@uni.edu:hunter2@site.edu/'), 'https://***@site.edu/');
        assert.equal(hidePasswords('ftp://bob@uni.edu:s3cret@ftp.host.edu/'), 'ftp://***@ftp.host.edu/');
        for (const url of ["https://o'brien:secret@host/", 'https://user,x:secret@host/', 'https://us;er:secret@host/', 'https://user&co:secret@host/', 'https://user(1):secret@host/', 'http://CORP\\svc:secret@host/', 'http://user:123,x@host/']) {
            assert.equal(hidePasswords(url), `${url.slice(0, url.indexOf('://'))}://***@host/`);
        }
    });

    it('leaves a URL in JSON, a URL with a path, and a URL before a newline alone', () => {
        for (const line of [
            '{"url":"http://x.com:80","mail":"u@v.edu"}',
            'https://site.edu/login?email=bob@x.edu',
            'http://backend:8001\nbob@c.edu',
        ]) assert.equal(hidePasswords(line), line);
    });

    it('takes away the text between a URL with no path and a later @', () => {
        // The price of a rule that does not show a password. No secret is in these lines.
        assert.equal(hidePasswords('https://a.edu?email=x@y.edu'), 'https://***@y.edu');
        assert.equal(hidePasswords('redirect_uri=http://localhost:3000&login_hint=alice@illinois.edu'), 'redirect_uri=http://***@illinois.edu');
        assert.equal(hidePasswords('http://a.edu;bob@x.edu'), 'http://***@x.edu');
        // Also after the logger has written a newline as \n.
        assert.equal(hidePasswords('http://a.edu\\nbob@c.edu'), 'http://***@c.edu');
    });

    it('hides a login that a cut ended before its @', () => {
        assert.equal(hidePasswords('http://user:topsecr...[cut 20 characters]'), 'http://***...[cut 20 characters]');
        assert.equal(hidePasswords('https://user:secr...[truncated]'), 'https://***...[truncated]');
        assert.equal(hidePasswords('https://a.edu/long/pa...[truncated]'), 'https://a.edu/long/pa...[truncated]');
    });

    it('is fast on a long text with many URLs', () => {
        const started = Date.now();
        for (const text of ['://'.repeat(100_000), 'a://b:'.repeat(50_000), `://u:${'x'.repeat(300_000)}`]) hidePasswords(text);
        assert.ok(Date.now() - started < 500);
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

    it('writes a message that is not a string', () => {
        const warnings = capture('warn');
        log.warning(123 as unknown as string);
        log.warning({ a: 1 } as unknown as string);
        assert.match(warnings[0], / WARN {2}123$/);
        assert.match(warnings[1], / WARN {2}\[object Object\]$/);
    });

    it('escapes every escape sequence when colours are off, and all but the colour codes when they are on', () => {
        const error = 'ERROR head\n  a \u001b[31mred\u001b[0m \u001b[8mhidden';
        assert.equal(finishLine(error, true), 'ERROR head\n  a \\x1b[31mred\\x1b[0m \\x1b[8mhidden');
        assert.equal(finishLine(`\u001b[31mERROR\u001b[39m head\n  a \u001b[31mred\u001b[0m \u001b[8mhidden`, true), '\u001b[31mERROR\u001b[39m head\n  a \u001b[31mred\u001b[0m \\x1b[8mhidden');
    });

    it('escapes an escape sequence in the text of an error, so it cannot fake a stack line', () => {
        const errors = capture('error');
        log.exception(new Error('a\n\u001b[31m at 2026-11-03 00:00:00.000 ERROR FORGED\u001b[8mhidden\u009b31m\u202egnp'), 'crawl failed');
        const lines = errors[0].split('\n');
        // The forged text is part of the line of the error message, with its codes written out.
        // (capture() takes the colour code \u001b[31m out; the code that hides text stays, written out.)
        assert.match(lines[1], /^\s+a\\n at 2026-11-03 00:00:00\.000 ERROR FORGED\\x1b\[8mhidden\\x9b31m\\u202egnp/);
        for (const line of lines.slice(1)) assert.match(line, /^ /);
    });

    it('is fast on a message with thousands of empty lines', () => {
        const warnings = capture('warn');
        const started = Date.now();
        // 9002 characters when written, so under the cut at 10,000.
        log.warning(`a${'\n'.repeat(3_000)}b${'\r\n'.repeat(1_500)}    at x (y.js:1:2)`);
        assert.ok(Date.now() - started < 100);
        assert.equal(warnings[0].split('\n').length, 2);
    });

    it('keeps 5000 characters of a stack', () => {
        const errors = capture('error');
        const error = new Error('deep');
        error.stack = `Error: deep\n${Array.from({ length: 200 }, (_, n) => `    at frame${n} (/app/node_modules/pkg/file.js:${n}:1)`).join('\n')}`;
        log.exception(error, 'failed');
        assert.ok(errors[0].length > 4_500 && errors[0].length < 5_600, `length ${errors[0].length}`);
    });

    it('puts the rid and course of the crawl on the lines of other crawlee loggers', () => {
        const require = createRequire(import.meta.url);
        const { log: browserPoolLog } = require(require.resolve('@crawlee/browser-pool').replace(/index\.js$/, 'logger.js'));
        const warnings = capture('warn');
        const prefix = 'rid=abc123 course=ece120';
        const crawlLog = log.child({ prefix });
        crawlContext.run(prefix, () => {
            browserPoolLog.warning('browser closed');
            log.warning('no prefix');
            crawlLog.warning('own prefix');
        });
        browserPoolLog.warning('outside a crawl');
        assert.match(warnings[0], / WARN {2}rid=abc123 course=ece120 BrowserPool: browser closed$/);
        assert.match(warnings[1], / WARN {2}rid=abc123 course=ece120: no prefix$/);
        assert.match(warnings[2], / WARN {2}rid=abc123 course=ece120: own prefix$/);
        assert.match(warnings[3], / WARN {2}BrowserPool: outside a crawl$/);
    });

    it('hides a login before the cut takes its @ away', () => {
        const infos = capture('log');
        log.info(`${'x'.repeat(9_980)} http://user:topsecretpassword@host.edu/`);
        assert.doesNotMatch(infos[0], /topsecr|user:/);
        assert.match(infos[0], / http:\/\/\*\*\*\S*\.\.\.\[cut 1 characters\]$/);
    });

    it('keeps a backslash and an n that are real text before a frame', () => {
        const warnings = capture('warn');
        log.warning('C:\\temp\\n\n\n    at x (y.js:1:2)\nmore\n\nlast\n');
        assert.deepEqual(warnings[0].split('\n').slice(0, 2).map((line) => line.replace(/^.* WARN {2}/, '')), ['C:\\temp\\n', '    at x (y.js:1:2)\\nmore\\n\\nlast\\n']);
    });

    it('writes a value that cannot be turned into text', () => {
        assert.equal(oneLine({ toString: 1 }), '[a value that cannot be written]');
        const warnings = capture('warn');
        log.warning({ toString: 1 } as unknown as string);
        assert.match(warnings[0], / WARN {2}\[a value that cannot be written\]$/);
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
    it('does not keep a line that starts with a tab on its own line', () => {
        assert.equal(finishLine('ERROR head\n\tat forged (x:1:1)', true), 'ERROR head\\n\\tat forged (x:1:1)');
        assert.equal(finishLine('ERROR head\n  message\n\tat forged (x:1:1)\n    at real (y:2:2)', true), 'ERROR head\n  message\\n\\tat forged (x:1:1)\n    at real (y:2:2)');
    });

    it('puts the crawl prefix in front of a logger of another crawl once, and not in front of its own children', () => {
        const warnings = capture('warn');
        crawlContext.run('rid=abc course=x', () => {
            log.child({ prefix: 'rid=abc course=x' }).warning('own');
            log.child({ prefix: 'rid=abc course=x:Child' }).warning('child');
            log.child({ prefix: 'rid=abc course=xy' }).warning('other');
        });
        assert.match(warnings[0], / WARN {2}rid=abc course=x: own$/);
        assert.match(warnings[1], / WARN {2}rid=abc course=x:Child: child$/);
        assert.match(warnings[2], / WARN {2}rid=abc course=x rid=abc course=xy: other$/);
    });

    it('keeps stack lines, folds every other line, and puts at= on the first line', () => {
        const line = ['ERROR head', '  Error message', 'second message line', '      at run (/app/a.js:1:2)', '    CAUSE: inner', 'stray'].join('\n');
        assert.equal(finishLine(line, true, 'src/main.ts:5'), ['ERROR head at=src/main.ts:5', '  Error message\\nsecond message line', '      at run (/app/a.js:1:2)', '    CAUSE: inner\\nstray'].join('\n'));
        assert.equal(finishLine('WARN x\nnot indented', false), 'WARN x\\nnot indented');
    });
});

describe('installProcessHandlers', () => {
    // The real thing, in a process of its own: the line is written and the exit code is 1.
    const runAndCrash = (code: string) => new Promise<{ code: number | null; stderr: string }>((resolve) => {
        const script = `const m = await import('./src/logSetup.ts'); m.installProcessHandlers(); ${code}`;
        // cwd: the script imports ./src/logSetup.ts. timeout: a child that does not exit must not hang the tests.
        const options = { cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 20_000, env: { ...process.env, FORCE_COLOR: '0', LOG_LEVEL: 'INFO' } };
        const child = execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], options, (_error, _stdout, stderr) => {
            resolve({ code: child.exitCode, stderr });
        });
    });

    it('stops the process with code 1 after an uncaught error and after an unhandled rejection', async () => {
        const thrown = await runAndCrash("setTimeout(() => { throw new Error('kaput'); }, 10);");
        assert.equal(thrown.code, 1);
        assert.match(thrown.stderr, / ERROR uncaught exception, the crawler stops at=src\/logSetup\.ts:\d+\n\s+kaput\n\s+at /);

        const rejected = await runAndCrash("Promise.reject(new Error('nobody waits')); setInterval(() => {}, 1000);");
        assert.equal(rejected.code, 1);
        assert.match(rejected.stderr, / ERROR unhandled promise rejection, the crawler stops at=src\/logSetup\.ts:\d+\n\s+nobody waits\n/);
    });

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
