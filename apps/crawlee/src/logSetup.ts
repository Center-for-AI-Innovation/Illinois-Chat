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

// Characters that can break or forge a log line: the C0 control characters (newline, NUL,
// ESC and the others), DEL, and the Unicode line separators.
const CONTROL_CHARACTERS = /\r\n|[\u0000-\u001f\u007f\u0085\u2028\u2029]/g;

function escapeControlCharacter(found: string): string {
    if (found === '\r\n' || found === '\n' || found === '\r') return '\\n';
    if (found === '\t') return '\\t';
    const code = found.charCodeAt(0);
    return code < 0x100 ? `\\x${code.toString(16).padStart(2, '0')}` : `\\u${code.toString(16).padStart(4, '0')}`;
}

// Keep a value on one line, so text from a request or a web page cannot start a fake log line.
export function oneLine(value: unknown): string {
    return String(value).replace(CONTROL_CHARACTERS, escapeControlCharacter);
}

// The login part of a URL: "://user:secret@host", "://:secret@host" and "://token@host".
// It must not reach the log. The match stops at the characters that end the host part of a
// URL or a JSON value, so "http://a.edu:80","mail":"b@c.edu" is left as it is, and it runs
// to the last @ before them, so a password with an @ in it is hidden as a whole.
// A login without "://" in front ("user:secret@host") is not found.
const LOGIN_IN_URL = /:\/\/[^/\s"'<>,?#]*@/g;

export function hidePasswords(text: string): string {
    return text.replace(LOGIN_IN_URL, '://***@');
}

// The methods of the logger itself: CrawlerLogger below, and Log, Logger and LoggerText of
// @apify/log (their classes are named _Log, _Logger and _LoggerText inside the package).
// Both the name and the file must match. The file alone is not enough to find where the
// logger ends, and the name alone would also match a class of the app that is named Logger.
// With --enable-source-maps the frames of @apify/log point to node_modules/@apify/src/.
const LOGGER_METHOD = /^\s+at (?:async )?(?:CrawlerLogger|_?LoggerText|_?Logger|_?Log)\./;
const LOGGER_FILE = /@apify[\\/]|[\\/]logSetup\.[jt]s/;
const isLoggerFrame = (frame: string) => LOGGER_METHOD.test(frame) && LOGGER_FILE.test(frame);

// "src/api/crawlee.ts:128" for the code that called log.error or log.exception, read from
// the stack of an Error made inside the logger. The caller is the first frame that is not
// a method of the logger. When that caller is a package in node_modules (crawlee logs its
// own errors) or Node itself, there is no app line to name.
export function callSite(stack: string): string | undefined {
    const frames = stack.split('\n').filter((line) => /^\s+at /.test(line));
    const first = frames.findIndex(isLoggerFrame);
    if (first < 0) return undefined;
    const frame = frames.slice(first).find((line) => !isLoggerFrame(line));
    if (!frame || /node_modules|\(?node:/.test(frame)) return undefined;
    const match = /([^\s()]+):(\d+):\d+\)?$/.exec(frame.trim());
    if (!match) return undefined;
    const file = match[1].replace(/^file:\/\//, '').replace(/\\/g, '/');
    // From src/ (tsx, or the built code with --enable-source-maps) or from dist/.
    const start = Math.max(file.lastIndexOf('/src/'), file.lastIndexOf('/dist/'));
    return `${start >= 0 ? file.slice(start + 1) : file}:${match[2]}`;
}

// A message longer than this is cut. A crawl URL or a line from a web page can be very long.
const MAX_MESSAGE_LENGTH = 10_000;

// crawlee puts the stack of a failed page inside the message. Those frame lines keep their
// own lines; every other control character in a message is escaped.
function messageOnOneLine(message: string): string {
    const text = message.length > MAX_MESSAGE_LENGTH
        ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...[cut ${message.length - MAX_MESSAGE_LENGTH} characters]`
        : message;
    return text.split(/(?:\r?\n)+(?=[ \t]+at )/).map(oneLine).join('\n');
}

// The colour codes that the logger itself puts around parts of a line.
const COLOUR_CODE = /\u001b\[[0-9;]*m/g;
// A control character that is not a newline and not the start of a colour code.
const STRAY_CONTROL_CHARACTERS = /\r|\u001b(?!\[[0-9;]*m)|[\u0000-\u0009\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f\u0085\u2028\u2029]/g;
// Lines of an event that stay on their own line: a stack frame, the cause of an error, and
// the note that @apify/log writes where it leaves out frames.
const STACK_LINE = /^\s+(?:at |CAUSE: |\.\.\. \d+ lines matching cause stack trace)/;

// One event as it goes to the console: the first line, then only stack lines. An error
// message of several lines (Playwright adds a "Call log") is put on one line with \n, so a
// line of the output starts with a timestamp or with spaces, and with nothing else.
export function finishLine(line: string, isError: boolean, at?: string): string {
    const kept: string[] = [];
    line.split('\n').forEach((part, index) => {
        const plain = part.replace(COLOUR_CODE, '');
        // The first line after the head is the message of the error, when it is indented.
        if (index === 0 || STACK_LINE.test(plain) || (index === 1 && /^\s/.test(plain))) kept.push(part);
        else kept[kept.length - 1] += `\\n${part}`;
    });
    if (isError && at) kept[0] += ` at=${at}`;
    return hidePasswords(kept.join('\n').replace(STRAY_CONTROL_CHARACTERS, escapeControlCharacter));
}

// crawlee's text logger, with three changes to every line:
// - one event is one line, with its stack on the lines that follow (crawlee and Playwright
//   put newlines in their messages)
// - the login part of a URL is written as ://***@
// - an ERROR line ends with at=<file>:<line>, the line of this app that logged it
export class CrawlerLogger extends LoggerText {
    private lastLine?: string;

    override _log(level: LogLevel, message: string, data?: any, exception?: unknown, opts?: Record<string, any>): string {
        const raw = super._log(level, message ? messageOnOneLine(message) : message, data, exception, opts);
        // super._log has sent the line through _outputWithConsole below. Return that line,
        // not the raw one, so a listener of the 'line' event gets the same text as the console.
        return this.lastLine ?? raw;
    }

    override _outputWithConsole(level: LogLevel, line: string): void {
        const isError = level === LogLevel.ERROR;
        this.lastLine = finishLine(line, isError, isError ? callSite(new Error().stack ?? '') : undefined);
        super._outputWithConsole(level, this.lastLine);
    }
}

// @apify/log cuts a stack at maxStringLength characters. Its default of 1000 keeps about
// 4 frames, fewer with --enable-source-maps, where the paths are longer.
const MAX_STACK_LENGTH = 5000;

// crawlee makes some loggers when it is imported (BrowserPool, Request, the Playwright
// utilities, the memory storage). Each took a reference to the root logger object of that
// moment. So that object is changed in place: a new logger object would not reach them.
const rootLogger = log.getOptions().logger;
if (rootLogger instanceof LoggerText) {
    Object.setPrototypeOf(rootLogger, CrawlerLogger.prototype);
    // skipTime: false puts a UTC timestamp at the start of every line.
    rootLogger.setOptions({ skipTime: false });
    log.setOptions({ level, maxStringLength: MAX_STACK_LENGTH });
} else {
    // APIFY_LOG_FORMAT asked for another logger (JSON). The crawler writes text lines.
    log.setOptions({ logger: new CrawlerLogger({ skipTime: false }), level, maxStringLength: MAX_STACK_LENGTH });
}

if (!(requested in LEVELS)) {
    log.warning(`Unknown LOG_LEVEL=${requested}, using INFO`);
}

// The logger writes with console.error, which does not wait for a pipe. process.exit right
// after it can lose the line that says why the process stops. So exit when stderr has taken
// what was written, or after 2 seconds if the pipe is stuck.
function exitAfterFlush(exit: (code: number) => void): void {
    let done = false;
    const timer = setTimeout(go, 2000);
    function go() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        exit(1);
    }
    process.stderr.write('', go);
}

// Lines that Node would write itself, without a timestamp. main.ts calls this once.
// - A process warning (for example the one for NODE_TLS_REJECT_UNAUTHORIZED) becomes a WARN line.
// - An error that nothing caught becomes one ERROR line with the stack. The process then
//   stops with exit code 1, as it did before; the container is started again.
export function installProcessHandlers(exit: (code: number) => void = (code) => process.exit(code)): void {
    // Node's own listener prints the warning to stderr; ours takes its place.
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
        const code = (warning as { code?: string }).code;
        const flags = process as { traceProcessWarnings?: boolean; traceDeprecation?: boolean };
        // --trace-warnings and --trace-deprecation ask for the stack of the warning.
        const wantsStack = flags.traceProcessWarnings || (flags.traceDeprecation && warning.name === 'DeprecationWarning');
        const frames = wantsStack ? (warning.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line)) : [];
        log.warning([`${warning.name}${code ? ` [${code}]` : ''}: ${warning.message}`, ...frames].join('\n'));
    });
    process.on('uncaughtException', (error) => {
        log.exception(error, 'uncaught exception, the crawler stops');
        exitAfterFlush(exit);
    });
    process.on('unhandledRejection', (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        log.exception(error, 'unhandled promise rejection, the crawler stops');
        exitAfterFlush(exit);
    });
}
