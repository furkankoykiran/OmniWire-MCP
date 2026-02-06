import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SentinelService } from './index.js';
import { CircuitState } from './types.js';

vi.mock('../../utils/logger.js', () => ({
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

describe('SentinelService', () => {
    let sentinel: SentinelService;
    const config = {
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        successThreshold: 3
    };

    beforeEach(() => {
        sentinel = new SentinelService(config);
    });

    afterEach(() => {
        // sentinel.stop(); // No stop method needed
    });

    it('should register a healthy source', () => {
        sentinel.registerSource({
            id: 'test-source',
            name: 'Test',
            url: 'http://example.com',
            type: 'rss',
            enabled: true,
            priority: 1
        });

        const status = sentinel.getSourceHealth('test-source');
        expect(status).toBeDefined();
        // Initial state depends on implementation, usually CLOSED (healthy)
        // Check against the enum value which is what comes back
        expect(status?.circuitState).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after failures exceed threshold', () => {
        const sourceId = 'fail-source';
        sentinel.registerSource({
            id: sourceId,
            name: 'Fail Test',
            url: 'http://example.com',
            type: 'rss',
            enabled: true,
            priority: 1
        });

        // Simulate failures
        for (let i = 0; i <= config.failureThreshold; i++) {
            sentinel.recordFailure(sourceId, 'Test Error');
        }

        const status = sentinel.getSourceHealth(sourceId);
        expect(status?.circuitState).toBe(CircuitState.OPEN); // Open = Broken
    });

    it('should allow request when healthy', () => {
        const sourceId = 'healthy-source';
        sentinel.registerSource({
            id: sourceId,
            name: 'Healthy Test',
            url: 'http://example.com',
            type: 'rss',
            enabled: true,
            priority: 1
        });

        expect(sentinel.canRequest(sourceId)).toBe(true);
    });

    it('should block request when open (unhealthy)', () => {
        const sourceId = 'blocked-source';
        sentinel.registerSource({
            id: sourceId,
            name: 'Blocked Test',
            url: 'http://example.com',
            type: 'rss',
            enabled: true,
            priority: 1
        });

        // Force open
        for (let i = 0; i <= config.failureThreshold; i++) {
            sentinel.recordFailure(sourceId, 'Test Error');
        }

        expect(sentinel.canRequest(sourceId)).toBe(false);
    });
});
