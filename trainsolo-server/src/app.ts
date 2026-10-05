import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import notFound from './app/middlewares/notFound';
import router from './app/routes';
import config from './app/config';

const app: Application = express();

// Security Response Headers
app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Tightened CORS Middleware
const trustedOriginPattern =
    /^(http:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/[a-zA-Z0-9_-]+\.vercel\.app|chrome-extension:\/\/[a-zA-Z0-9]+)$/;

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow same-origin / server-to-server requests with no origin header
            if (!origin) return callback(null, true);

            if (
                trustedOriginPattern.test(origin) ||
                (config.client_url && origin.startsWith(config.client_url))
            ) {
                return callback(null, true);
            }

            return callback(new Error('Blocked by CORS policy'));
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'x-device-id',
            'x-device-key',
            'x-requested-with',
        ],
        credentials: true,
    }),
);

// Body parser with size limits
app.use(express.json({ limit: '10kb' }));

// Locate client build directory (trainsolo-client/dist)
const clientDistCandidates = [
    path.resolve(__dirname, '../../trainsolo-client/dist'),
    path.resolve(process.cwd(), '../trainsolo-client/dist'),
    path.resolve(process.cwd(), 'trainsolo-client/dist'),
    path.resolve(__dirname, '../trainsolo-client/dist'),
];
const clientDist = clientDistCandidates.find((dir) => fs.existsSync(dir));

if (clientDist) {
    app.use(express.static(clientDist));
}

// application API routes
app.use('/api/v1', router);

// Serve React SPA fallback if client dist exists
if (clientDist) {
    app.use((req: Request, res: Response, next: NextFunction) => {
        if (
            (req.method === 'GET' || req.method === 'HEAD') &&
            !req.path.startsWith('/api')
        ) {
            return res.sendFile(path.join(clientDist, 'index.html'));
        }
        next();
    });
} else {
    // Fallback test route when static client build is not found
    app.get('/', (_req: Request, res: Response) => {
        res.send({ message: 'TrainSolo Server is Running...' });
    });
}

// global error handler
app.use(globalErrorHandler);

// not found route
app.use(notFound);

export default app;
