import { z } from 'zod';

/**
 * Schema for individual source/feed configuration
 */
export const SourceConfigSchema = z.object({
    /** Unique identifier for the source */
    id: z.string().min(1),
    /** Human-readable name */
    name: z.string().min(1),
    /** URL to fetch content from */
    url: z.string().url(),
    /** Content type hint (auto = sniff) */
    type: z.enum(['auto', 'rss', 'atom', 'json', 'html']).default('auto'),
    /** Optional CSS selector for HTML parsing */
    selector: z.string().optional(),
    /** Category/tag for grouping */
    category: z.string().optional(),
    /** Priority (higher = more important) */
    priority: z.number().int().min(0).max(100).default(50),
    /** Is this source enabled? */
    enabled: z.boolean().default(true),
});

export type SourceConfig = z.infer<typeof SourceConfigSchema>;

/**
 * Schema for full application configuration
 */
export const AppConfigSchema = z.object({
    /** List of sources to aggregate */
    sources: z.array(SourceConfigSchema).min(1),
    /** How often to poll for config changes (ms) */
    configPollIntervalMs: z.number().int().min(10000).default(60000),
    /** How often to fetch content from sources (ms) */
    contentPollIntervalMs: z.number().int().min(30000).default(300000),
    /** Request timeout for fetching sources (ms) */
    requestTimeoutMs: z.number().int().min(1000).default(10000),
    /** Maximum items to keep per source */
    maxItemsPerSource: z.number().int().min(1).default(50),
    /** Sentinel configuration */
    sentinel: z.object({
        /** Number of failures before circuit opens */
        failureThreshold: z.number().int().min(1).default(3),
        /** How long to wait before trying again (ms) */
        recoveryTimeoutMs: z.number().int().min(5000).default(60000),
        /** Success count to close circuit */
        successThreshold: z.number().int().min(1).default(2),
    }).default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Default configuration when no remote config is available
 */
export const DEFAULT_CONFIG: AppConfig = {
    sources: [],
    configPollIntervalMs: 60000,
    contentPollIntervalMs: 300000,
    requestTimeoutMs: 10000,
    maxItemsPerSource: 50,
    sentinel: {
        failureThreshold: 3,
        recoveryTimeoutMs: 60000,
        successThreshold: 2,
    },
};
