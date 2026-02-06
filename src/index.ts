#!/usr/bin/env node
import { OmniWireServer } from './mcp/server.js';
import { logger } from './utils/logger.js';

/**
 * Application Entry Point
 */
async function main() {
    process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down...');
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        process.exit(1);
    });

    const server = new OmniWireServer();
    await server.start();
}

main().catch((error) => {
    logger.error('Fatal error during startup:', error);
    process.exit(1);
});
