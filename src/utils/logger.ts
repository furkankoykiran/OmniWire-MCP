import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

/**
 * Custom log format for production-grade logging
 */
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }

    return msg;
});

/**
 * Winston logger configured for MCP server
 * 
 * - Console output with colors in development
 * - JSON format for production
 * - Configurable log level via LOG_LEVEL env var
 */
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.Console({
            stderrLevels: ['error', 'warn', 'info', 'debug'],
            format: combine(
                colorize({ all: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            ),
        }),
    ],
});

/**
 * Create a child logger with a specific context
 */
export function createLogger(context: string): winston.Logger {
    return logger.child({ context });
}
