// Configures crawlee's own logger once, before any other module logs.
// main.ts imports this file first, so module-level lines in other files are formatted too.
import { AsyncLocalStorage } from 'node:async_hooks';
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

// Characters that can break or forge a log line: the C0 and C1 control characters (newline,
// NUL, ESC and the others), DEL, the Unicode line separators, and the characters that
// change the direction of the text.
const CONTROL_CHARACTERS = /\r\n|[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

function escapeControlCharacter(found: string): string {
    if (found === '\r\n' || found === '\n' || found === '\r') return '\\n';
    if (found === '\t') return '\\t';
    const code = found.charCodeAt(0);
    return code < 0x100 ? `\\x${code.toString(16).padStart(2, '0')}` : `\\u${code.toString(16).padStart(4, '0')}`;
}

// Keep a value on one line, so text from a request or a web page cannot start a fake log line.
export function oneLine(value: unknown): string {
    return text(value).replace(CONTROL_CHARACTERS, escapeControlCharacter);
}

// String(value) throws for some values of a request body ({"toString": 1}).
function text(value: unknown): string {
    try {
        return String(value);
    } catch {
        return '[a value that cannot be written]';
    }
}

// The login part of a URL: "://user:secret@host", "://:secret@host", "://token@host" and
// "://user@realm:secret@host". It must not reach the log. The same rule as LOGIN_IN_URL in
// the frontend log.ts, with no exceptions, so that a password is not shown: the login is
// everything from "://" (or more slashes: a browser reads "http:///user:pw@host" as a URL
// with a login) to the last @ before the next /, space or double quote. The double quote
// ends it because a URL in JSON ends there: {"url":"http://a.edu:80","mail":"b@c.edu"} is
// left as it is.
// The cost: text that is not a login can be lost. "https://a.edu?email=a@b.edu" is written
// as "https://***@b.edu". A URL with a path is not touched.
// Not found: a login without "://" in front ("user:secret@host"), and a password that has
// a /, a space or a double quote in it.
const LOGIN_IN_URL = /:\/{2,}[^/\s"]*@/g;
// A login that a cut ended before its @: "://user:secr...[cut 20 characters]" and the
// "...[truncated]" of @apify/log.
const LOGIN_BEFORE_CUT = /:\/{2,}[^/\s"]*?(?=\.\.\.\[(?:cut|truncated))/g;

export function hidePasswords(line: string): string {
    return line.replace(LOGIN_IN_URL, '://***@').replace(LOGIN_BEFORE_CUT, '://***');
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
// own lines; every other line is joined to the line before it with a written \n, and every
// control character is escaped. A login in a URL is hidden first, before the cut can take
// its @ away. The result is cut last, so the limit
// is on what is written.
function messageOnOneLine(message: unknown): string {
    const out: string[] = [];
    // Empty lines that were read and not yet written.
    let empty = 0;
    for (const line of hidePasswords(text(message)).split(/\r\n|\n|\r/)) {
        if (out.length === 0) {
            out.push(oneLine(line));
        } else if (/^[ \t]+at /.test(line)) {
            // Empty lines between the text and a frame are dropped.
            empty = 0;
            out.push(oneLine(line));
        } else if (line === '') {
            empty++;
        } else {
            out[out.length - 1] += `${'\\n'.repeat(empty + 1)}${oneLine(line)}`;
            empty = 0;
        }
    }
    out[out.length - 1] += '\\n'.repeat(empty);
    const joined = out.join('\n');
    return joined.length > MAX_MESSAGE_LENGTH
        ? `${joined.slice(0, MAX_MESSAGE_LENGTH)}...[cut ${joined.length - MAX_MESSAGE_LENGTH} characters]`
        : joined;
}

// The colour codes that the logger itself puts around parts of a line when colours are on
// (ansi-colors: reset, the 8 colours and their bright forms).
const COLOUR_CODE = /\u001b\[(?:0|22|39|3[0-7]|9[0-7])m/g;
// A control character that is not a newline. With colours on, the colour codes above stay;
// any other escape sequence is escaped, also the ones that hide text or move the cursor.
// With colours off (FORCE_COLOR=0, as in the Docker image), every ESC is escaped.
const CONTROL_EXCEPT_COLOURS = /\r|\u001b(?!\[(?:0|22|39|3[0-7]|9[0-7])m)|[\u0000-\u0009\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_EXCEPT_NEWLINE = /\r|[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
// Lines of an event that stay on their own line: a stack frame, the cause of an error, and
// the note that @apify/log writes where it leaves out frames.
const STACK_LINE = /^\s+(?:at |CAUSE: |\.\.\. \d+ lines matching cause stack trace)/;

// One event as it goes to the console: the first line, then only stack lines. An error
// message of several lines (Playwright adds a "Call log") is put on one line with \n, so a
// line of the output starts with a timestamp or with spaces, and with nothing else.
export function finishLine(line: string, isError: boolean, at?: string): string {
    const kept: string[] = [];
    const parts = line.split('\n');
    // The head line has no ESC from input (the message is escaped, the data is JSON), so a
    // colour code in it comes from the logger: colours are on.
    const coloursOn = parts[0].search(COLOUR_CODE) >= 0;
    parts.forEach((raw, index) => {
        // The message was done in messageOnOneLine; this is for the data and the error text.
        const part = hidePasswords(raw);
        // A line that stays on its own must start with real spaces: @apify/log writes the
        // indent first and the colour code after it. Text that starts with a colour code
        // and then looks like a frame is joined to the line before it.
        // A tab does not count: it is written as \t below, and the line would then start
        // with text.
        const indented = /^ /.test(part);
        const plain = part.replace(COLOUR_CODE, '');
        // The first line after the head is the message of the error, when it is indented.
        if (index === 0 || (indented && (STACK_LINE.test(plain) || index === 1))) kept.push(part);
        else kept[kept.length - 1] += `\\n${part}`;
    });
    if (isError && at) kept[0] += ` at=${at}`;
    return kept.join('\n').replace(coloursOn ? CONTROL_EXCEPT_COLOURS : CONTROL_EXCEPT_NEWLINE, escapeControlCharacter);
}

// The "rid=<id> course=<name>" of the crawl that the running code belongs to. main.ts runs
// each crawl inside crawlContext.run(prefix, ...).
export const crawlContext = new AsyncLocalStorage<string>();

// crawlee's text logger, with these changes to every line:
// - one event is one line, with its stack on the lines that follow (crawlee and Playwright
//   put newlines in their messages)
// - the login part of a URL is written as ://***@
// - an ERROR line ends with at=<file>:<line>, the line of this app that logged it
export class CrawlerLogger extends LoggerText {
    private lastLine?: string;

    override _log(level: LogLevel, message: string, data?: any, exception?: unknown, opts?: Record<string, any>): string {
        // Some loggers of crawlee do not come from the logger of the crawl (RequestQueue,
        // BrowserPool, Request, the Playwright utilities). Inside a crawl, their lines get
        // the "rid=<id> course=<name>" of that crawl in front of their own prefix.
        const crawl = crawlContext.getStore();
        const own = String(opts?.prefix ?? '');
        // The logger of the crawl has exactly this prefix, and its children start with it.
        if (crawl && own !== crawl && !own.startsWith(`${crawl}:`) && !own.startsWith(`${crawl} `)) {
            opts = { ...opts, prefix: opts?.prefix ? `${crawl} ${opts.prefix}` : crawl };
        }
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

// @apify/log cuts a text inside an error at half of maxStringLength for each level of
// nesting: the stack of an error at a half, the stack of its cause at a quarter. Its
// default of 1000 keeps about 2 frames of a stack. With 10,000, a stack keeps 5,000
// characters and the stack of a cause 2,500.
const MAX_STRING_LENGTH = 10_000;

// crawlee makes some loggers when it is imported (BrowserPool, Request, the Playwright
// utilities, the memory storage). Each took a reference to the root logger object of that
// moment. So that object is changed in place: a new logger object would not reach them.
// This also holds when APIFY_LOG_FORMAT asked for the JSON logger: the crawler writes text.
// Those early loggers keep the maxStringLength and the level that they read at import.
const rootLogger = log.getOptions().logger;
Object.setPrototypeOf(rootLogger, CrawlerLogger.prototype);
// skipTime: false puts a UTC timestamp at the start of every line.
rootLogger.setOptions({ skipTime: false });
log.setOptions({ level, maxStringLength: MAX_STRING_LENGTH });

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
