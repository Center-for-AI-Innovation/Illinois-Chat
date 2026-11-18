// Run with `npm test` (node:test through tsx). Not part of the build: tsconfig.json excludes it.
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { log } from 'crawlee';
import { callSite, hidePasswords, installProcessHandlers, oneLine } from './logSetup.js';

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

    it('oneLine keeps a value on one line', () => {
        assert.equal(oneLine('a\r\nb\nc\rd'), 'a\\nb\\nc\\nd');
    });
});

describe('installProcessHandlers', () => {
    it('writes a warning and an uncaught error through the logger, then stops with code 1', () => {
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
            assert.equal(exits.length, 0);

            added('uncaughtException').forEach((fn) => fn(new Error('kaput')));
            assert.match(errors[0].split('\n')[0], / ERROR uncaught exception, the crawler stops at=src\/logSetup\.ts:\d+$/);
            assert.match(errors[0], /kaput/);

            added('unhandledRejection').forEach((fn) => fn('just a string'));
            assert.match(errors[1].split('\n')[0], / ERROR unhandled promise rejection, the crawler stops at=src\/logSetup\.ts:\d+$/);
            assert.match(errors[1], /just a string/);
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
