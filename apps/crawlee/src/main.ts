// uploadToS3.ts
// logSetup must stay the first import: it configures the logger before other modules log.
import { oneLine } from './logSetup.js';
import { randomBytes } from 'crypto';
import express, { Request, Response } from 'express';
import { log } from 'crawlee';
import { crawl } from './api/crawlee.js';
import healthRoute from './api/health.js'; // Import your health route

import cors from 'cors';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();

// const corsOptions = {
//     origin: 'https://uiuc.chat',
// };

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

// Request ids come from the caller (X-Request-ID) or are minted here. Anything that does not
// match this pattern is replaced, so a header value cannot break the log line.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

app.post('/crawl', async (req: Request, res: Response) => {
    const incomingId = req.get('x-request-id');
    const rid = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomBytes(6).toString('hex');
    res.set('X-Request-ID', rid);
    // Never log req.body: it can carry cookies. Log only the fields below.
    const params = req.body?.params ?? {};
    const prefix = params.courseName ? `rid=${rid} course=${oneLine(params.courseName)}` : `rid=${rid}`;
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

        const results = await crawl(req.body.params, clog, rid);
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log.info(`Server running on port ${PORT}`);
});
