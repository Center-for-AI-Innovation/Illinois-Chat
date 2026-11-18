// Configures crawlee's own logger once, before any other module logs.
// main.ts imports this file first, so module-level lines in other files are formatted too.
import { configDotenv } from 'dotenv';
import { log, LoggerText, LogLevel } from 'crawlee';

configDotenv();

// LOG_LEVEL uses the same names as the Python services. Crawlee reads APIFY_LOG_LEVEL,
// so we derive it from LOG_LEVEL and also set the level on the root logger directly
// (the root logger read APIFY_LOG_LEVEL when crawlee was imported, before this ran).
const LEVELS: Record<string, LogLevel> = {
    DEBUG: LogLevel.DEBUG,
    INFO: LogLevel.INFO,
    WARN: LogLevel.WARNING,
    WARNING: LogLevel.WARNING,
    ERROR: LogLevel.ERROR,
    CRITICAL: LogLevel.ERROR,
};
const requested = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
const level = LEVELS[requested] ?? LogLevel.INFO;
process.env.APIFY_LOG_LEVEL = LogLevel[level];

// Keep a value on one line, so text from a request or a web page cannot start a fake log line.
export function oneLine(value: unknown): string {
    return String(value).replace(/\r?\n|\r/g, '\\n');
}

// "://user:secret@host" in a URL. The password must not reach the log; the same rule as
// _PASSWORD_IN_URL in the Python log_setup.py and PASSWORD_IN_URL in the frontend log.ts.
const PASSWORD_IN_URL = /:\/\/[^/@\s]+:[^/@\s]+@/g;

export function hidePasswords(text: string): string {
    return text.replace(PASSWORD_IN_URL, '://***@');
}

// The methods of the logger itself, by name: CrawlerLogger below, and Log, Logger and
// LoggerText of @apify/log (their classes are named _Log, _Logger and _LoggerText inside
// the package). The file path cannot be used: with --enable-source-maps the frames of
// @apify/log point to node_modules/@apify/src/, not to node_modules/@apify/log/.
const LOGGER_FRAME = /^\s+at (?:async )?(?:CrawlerLogger|_?LoggerText|_?Logger|_?Log)\./;

// "src/api/crawlee.ts:128" for the code that called log.error or log.exception, read from
// the stack of an Error made inside the logger. The caller is the first frame that is not
// a method of the logger. When that caller is a package in node_modules (crawlee logs its
// own errors) or Node itself, there is no app line to name.
export function callSite(stack: string): string | undefined {
    const frames = stack.split('\n').filter((line) => /^\s+at /.test(line));
    const first = frames.findIndex((frame) => LOGGER_FRAME.test(frame));
    if (first < 0) return undefined;
    const frame = frames.slice(first).find((line) => !LOGGER_FRAME.test(line));
    if (!frame || /node_modules|\(?node:/.test(frame)) return undefined;
    const match = /([^\s()]+):(\d+):\d+\)?$/.exec(frame.trim());
    if (!match) return undefined;
    const file = match[1].replace(/^file:\/\//, '').replace(/\\/g, '/');
    // From src/ (tsx, or the built code with --enable-source-maps) or from dist/.
    const start = Math.max(file.lastIndexOf('/src/'), file.lastIndexOf('/dist/'));
    return `${start >= 0 ? file.slice(start + 1) : file}:${match[2]}`;
}

// crawlee puts the stack of a failed page inside the message. Those frame lines keep their
// newline; every other newline in a message is written as \n.
function messageOnOneLine(message: string): string {
    return message.replace(/(?:\r?\n)+(?=[ \t]+at )/g, '\u0000').replace(/\r?\n|\r/g, '\\n').replace(/\u0000/g, '\n');
}

// crawlee's text logger, with three changes to every line:
// - the message stays on one line (crawlee and Playwright put newlines in their messages);
//   a stack still follows on its own lines
// - a password in a URL is written as ://***@
// - an ERROR line ends with at=<file>:<line>, the line of this app that logged it
export class CrawlerLogger extends LoggerText {
    override _log(level: LogLevel, message: string, data?: any, exception?: unknown, opts?: Record<string, any>): string {
        return super._log(level, message ? messageOnOneLine(message) : message, data, exception, opts);
    }

    override _outputWithConsole(level: LogLevel, line: string): void {
        let out = hidePasswords(line);
        if (level === LogLevel.ERROR) {
            const at = callSite(new Error().stack ?? '');
            if (at) {
                const firstLineEnd = out.indexOf('\n');
                out = firstLineEnd < 0 ? `${out} at=${at}` : `${out.slice(0, firstLineEnd)} at=${at}${out.slice(firstLineEnd)}`;
            }
        }
        super._outputWithConsole(level, out);
    }
}

// skipTime: false puts a UTC timestamp at the start of every line.
log.setOptions({ logger: new CrawlerLogger({ skipTime: false }), level });

if (!(requested in LEVELS)) {
    log.warning(`Unknown LOG_LEVEL=${requested}, using INFO`);
}

// Lines that Node would write itself, without a timestamp. main.ts calls this once.
// - A process warning (for example the one for NODE_TLS_REJECT_UNAUTHORIZED) becomes a WARN line.
// - An error that nothing caught becomes one ERROR line with the stack. The process then
//   stops with exit code 1, as it did before; the container is started again.
export function installProcessHandlers(exit: (code: number) => void = (code) => process.exit(code)): void {
    // Node's own listener prints the warning to stderr; ours takes its place.
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
        log.warning(`${warning.name}: ${warning.message}`);
    });
    process.on('uncaughtException', (error) => {
        log.exception(error, 'uncaught exception, the crawler stops');
        exit(1);
    });
    process.on('unhandledRejection', (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        log.exception(error, 'unhandled promise rejection, the crawler stops');
        exit(1);
    });
}
