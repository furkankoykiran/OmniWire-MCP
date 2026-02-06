import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigLoader } from './index.js';


// Mock logger to avoid cluttering test output
vi.mock('../utils/logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

describe('ConfigLoader', () => {
    let loader: ConfigLoader;

    beforeEach(() => {
        // Reset env vars
        delete process.env.RSS_FEEDS;
        loader = new ConfigLoader();
    });

    afterEach(() => {
        if (loader) {
            loader.stop();
        }
    });

    it('should load default config when no env var is set', async () => {
        await loader.initialize();
        const config = loader.getConfig();
        expect(config).toBeDefined();
        // Since we load from local file in default now, it should strictly match AppConfigSchema
        // Just checking basic property existence
        expect(config.sources.length).toBeGreaterThan(0);
        expect(config.sentinel).toBeDefined();
    });

    it('should parse JSON string from RSS_FEEDS env var', async () => {
        const customConfig = {
            sources: [
                {
                    id: 'test-source',
                    name: 'Test Source',
                    url: 'http://example.com/rss',
                    type: 'rss',
                    enabled: true
                }
            ],
            configPollIntervalMs: 60000,
            requestTimeoutMs: 5000,
            sentinel: {
                failureThreshold: 5,
                recoveryTimeoutMs: 30000
            }
        };

        // Re-instantiate with env var set (simulating process restart behavior or constructor logic)
        // Note: In our implementation, we read process.env.RSS_FEEDS in constructor.
        process.env.RSS_FEEDS = JSON.stringify(customConfig);
        loader = new ConfigLoader();

        await loader.initialize();
        const config = loader.getConfig();

        expect(config.sources).toHaveLength(1);
        expect(config.sources[0].id).toBe('test-source');
    });

    it('should fallback to defaults if JSON in RSS_FEEDS is invalid', async () => {
        process.env.RSS_FEEDS = '{ invalid config ';
        loader = new ConfigLoader();

        await loader.initialize();
        const config = loader.getConfig();

        // Should have fallen back to default
        expect(config.sources.length).toBeGreaterThan(0);
    });
});
