// uploadToS3.ts
// logSetup must stay the first import: it configures the logger before other modules log.
import { crawlContext, installProcessHandlers, oneLine } from './logSetup.js';
import { randomBytes } from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { log } from 'crawlee';
import { crawl } from './api/crawlee.js';
import healthRoute from './api/health.js'; // Import your health route

import cors from 'cors';

installProcessHandlers();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();

// const corsOptions = {
//     origin: 'https://uiuc.chat',
// };

function encodeField(value: string): string {
    return value.replace(/[^\w.~-]/gu, (character) => {
        try {
            return encodeURIComponent(character);
        } catch {
            // Half of a surrogate pair.
            return '%3F';
        }
    });
}

// Request ids come from the caller (X-Request-ID) or are minted here. Anything that does not
// match this pattern is replaced, so a header value cannot break the log line.
// This is the first middleware, so every reply has the id: also the reply to OPTIONS, and
// the reply to a request with a bad body.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
app.use((req, res, next) => {
    const incomingId = req.get('x-request-id');
    const rid = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomBytes(6).toString('hex');
    res.locals.rid = rid;
    res.set('X-Request-ID', rid);
    next();
});

// app.use(cors()); // Enable CORS for all routes and origins
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
        res.status(200).json({});
    } else {
        next();
    }
});
// app.use(cors(corsOptions)); // only certain routes

app.use(express.json());

app.post('/crawl', async (req: Request, res: Response) => {
    const rid: string = res.locals.rid;
    // Never log req.body: it can carry cookies. Log only the fields below.
    const params = req.body?.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
        // No params object: the body is not JSON, or the caller left params out.
        log.child({ prefix: `rid=${rid}` }).warning('request refused method=POST path=/crawl status=400: the body has no params object');
        res.status(400).json({ error: 'Bad request', errorTitle: 'BadRequest', errorMessage: 'The request body must be JSON with a "params" object.' });
        return;
    }
    // The course name is on every line of the crawl. A space (or a character that looks
    // like one) in it would let a caller add a fake field ("course=x rid=other"). So it is
    // cut, and every character that is not a letter, a digit or one of . _ ~ - is written
    // as %XX. A usual project name stays as it is.
    const course = params.courseName ? encodeField(oneLine(params.courseName).slice(0, 200)) : '';
    const prefix = course ? `rid=${rid} course=${course}` : `rid=${rid}`;
    const clog = log.child({ prefix });
    const started = Date.now();
    clog.info(`crawl started url=${oneLine(params.url)} strategy=${oneLine(params.scrapeStrategy)} maxPages=${oneLine(params.maxPagesToCrawl)}`);
    try {
        // const { url, scrapeStrategy, match, exclude, maxPagesToCrawl, courseName, maxTokens, maxConcurrency, maxRequestsPerMinute } = req.body.params;
        // console.log('Top of /crawl -- got variables :) url:', url, 'scrapeStrategy:', scrapeStrategy, 'match', match, 'exclude', exclude, 'maxPagesToCrawl:', maxPagesToCrawl, 'maxTokens:', maxTokens, 'courseName:', courseName, 'maxConcurrency:', maxConcurrency, 'maxRequestsPerMinute:', maxRequestsPerMinute)

        // const params = req.body.params;
        // const config = {
        //     url: params.url,
        //     scrapeStrategy: params.scrapeStrategy,
        //     match: params.match,
        //     exclude: params.exclude, //  "https://www.facebook.com/**", "https://youtube.com/**", "https://linkedin.com/**", "https://instagram.com/**"
        //     maxPagesToCrawl: params.maxPagesToCrawl,
        //     courseName: params.courseName,
        //     maxTokens: params.maxTokens,
        //     // Use default values as specified in configSchema if undefined
        //     maxConcurrency: params.maxConcurrency,
        //     maxRequestsPerMinute: params.maxRequestsPerMinute,
        // };

        // Inside the context, the lines of crawlee loggers that are not clog get the prefix too.
        const results = await crawlContext.run(prefix, () => crawl(req.body.params, clog, rid));
        clog.info(`crawl done pages=${results} ms=${Date.now() - started}`);
        res.status(200).json(`Crawl completed successfully. Number of results: ${results}`);
    } catch (error) {
        const e = error as Error;
        if (e?.name === 'ZodError') {
            // Bad request params: the message says which field is wrong, a stack adds nothing.
            clog.error(`crawl failed, invalid params ms=${Date.now() - started}: ${oneLine(e.message.replace(/\s+/g, ' '))}`);
        } else {
            clog.exception(e, `crawl failed ms=${Date.now() - started}`);
        }
        res.status(500).json({ error: 'An error occurred during the upload', errorTitle: e.name, errorMessage: e.message });
    } finally {
        if (global.gc) {
            global.gc();
        }
    }
});

// add a health check route
app.use('/api', healthRoute); // GET /api/health

// Errors from outside the /crawl handler, for example a body that is not valid JSON.
// Without this, express prints the stack itself, with no timestamp and no request id.
// It must be the last app.use, and express knows it as an error handler by its 4 arguments.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const given = Number(err?.status ?? err?.statusCode);
    // Only a 4xx or 5xx status from the error is used; anything else is a 500.
    const status = Number.isInteger(given) && given >= 400 && given <= 599 ? given : 500;
    // The parse error of a JSON body quotes a piece of the body, which can be part of a
    // cookie. Use a fixed text for it.
    const reason = err?.type === 'entity.parse.failed' ? 'the body is not valid JSON' : String(err?.message ?? '');
    const elog = log.child({ prefix: `rid=${res.locals.rid}` });
    const what = `method=${req.method} path=${oneLine(req.path)} status=${status}`;
    if (status >= 500) {
        elog.exception(err, `request failed ${what}`);
    } else {
        // The caller sent a bad request: the message says what is wrong, a stack adds nothing.
        elog.warning(`request refused ${what}: ${oneLine(reason)}`);
    }
    if (res.headersSent) {
        // The reply has started, so its status cannot change. Close the connection.
        req.socket?.destroy();
        return;
    }
    res.status(status).json({
        error: status >= 500 ? 'Internal server error' : 'Bad request',
        errorTitle: String(err?.name ?? 'Error'),
        errorMessage: status >= 500 ? 'The crawler hit an unexpected error.' : reason,
    });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log.info(`Server running on port ${PORT}`);
});
