/* eslint-disable no-console */
import { Server } from 'http';
import app from './app';
import config from './app/config';

const port = Number(config.port) || 5000;

let server: Server;

async function main() {
    try {
        server = app.listen(port, () => {
            console.log(
                `🚀 TrainSolo Unified Server is running at http://localhost:${port}`,
            );
        });
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
