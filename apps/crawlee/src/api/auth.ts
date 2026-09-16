import { createHash, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Bearer-token guard for POST /crawl.
 *
 * The crawler takes a URL and a project name from the caller and then fetches
 * whatever it is pointed at, so it must not be an open endpoint. Unlike the
 * backend's /ingest, this one fails *closed*: an unset CRAWLEE_API_KEY is a
 * misconfiguration (503), not permission to run unauthenticated.
 *
 * Tokens are compared as fixed-length sha256 digests so timingSafeEqual cannot
 * throw on a length mismatch and the comparison leaks no length information.
 */
export function requireCrawleeApiKey(req: Request, res: Response, next: NextFunction) {
    const expected = process.env.CRAWLEE_API_KEY;
    if (!expected) {
        console.error('CRAWLEE_API_KEY is not set — refusing every /crawl request.');
        res.status(503).json({ error: 'crawler is not configured: CRAWLEE_API_KEY is unset' });
        return;
    }

    const header = req.headers.authorization ?? '';
    const prefix = 'Bearer ';
    if (!header.startsWith(prefix)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }

    const presented = header.slice(prefix.length);
    if (!timingSafeEqual(sha256(presented), sha256(expected))) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }

    next();
}

function sha256(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
}
