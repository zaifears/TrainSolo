/* eslint-disable no-console */
import { Server } from 'http';
import { execSync } from 'child_process';
import app from './app';
import config from './app/config';

const port = Number(config.port) || 5000;

let server: Server;

function startServer(retrying = false) {
    server = app.listen(port, () => {
        console.log(
            `🚀 TrainSolo Unified Server is running at http://localhost:${port}`,
        );
    });

    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && !retrying) {
            console.warn(`⚠️  Port ${port} is occupied. Freeing port for TrainSolo...`);
            try {
                if (process.platform === 'win32') {
                    execSync(
                        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
                        { stdio: 'ignore' },
                    );
                    setTimeout(() => startServer(true), 800);
                    return;
                }
            } catch (_) {}
        }
        console.error(`Failed to start server on port ${port}:`, err.message || err);
        process.exit(1);
    });
}

async function main() {
    try {
        startServer();
    } catch (error) {
        console.log(error);
    }
}

if (!process.env.VERCEL) {
    main();
}

export default app;

const exitHandler = () => {
    if (server) {
        server.close(() => {
            console.info('Server closed!');
        });
    }
    process.exit(1);
};

process.on('uncaughtException', (error) => {
    console.log(error);
    exitHandler();
});

process.on('unhandledRejection', (error) => {
    console.log(error);
    exitHandler();
});
