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

// skipTime: false puts a UTC timestamp at the start of every line.
log.setOptions({ logger: new LoggerText({ skipTime: false }), level });

if (!(requested in LEVELS)) {
    log.warning(`Unknown LOG_LEVEL=${requested}, using INFO`);
}

// Keep a value on one line, so text from a request or a web page cannot start a fake log line.
export function oneLine(value: unknown): string {
    return String(value).replace(/\r?\n|\r/g, '\\n');
}
