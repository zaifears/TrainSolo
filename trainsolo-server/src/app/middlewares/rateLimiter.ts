import { Request, Response, NextFunction } from 'express';
import status from 'http-status';

interface RateLimitRecord {
    count: number;
    resetTime: number;
}

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 40; // Max 40 requests per minute (allows 15s polling + occasional manual scans)

const ipStore = new Map<string, RateLimitRecord>();

// Periodic cleanup of stale records every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipStore.entries()) {
        if (now > record.resetTime) {
            ipStore.delete(ip);
        }
    }
}, 5 * 60 * 1000);

export const ticketRateLimiter = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();

    const record = ipStore.get(ip);

    if (!record || now > record.resetTime) {
        ipStore.set(ip, {
            count: 1,
            resetTime: now + WINDOW_MS,
        });
        return next();
    }

    if (record.count >= MAX_REQUESTS) {
        return res.status(status.TOO_MANY_REQUESTS).json({
            success: false,
            message:
                'Too many ticket scan requests. Please wait a moment to avoid Bangladesh Railway IP blocks.',
        });
    }

    record.count += 1;
    next();
};
