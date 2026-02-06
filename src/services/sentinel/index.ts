import { EventEmitter } from 'events';
import { CircuitBreaker } from './circuit-breaker.js';
import {
    CircuitState,
    CircuitBreakerConfig,
    HealthStatus,
    SourceHealth
} from './types.js';
import { SourceConfig } from '../../config/schema.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('Sentinel');

/**
 * Sentinel Service: Intelligent Source Health Monitoring
 * 
 * Features:
 * - Circuit Breaker pattern per source
 * - Health state tracking (healthy, degraded, unhealthy)
 * - Automatic recovery with exponential backoff
 * - Health metrics exposure for AI consumption
 * - Event-driven notifications
 */
export class SentinelService extends EventEmitter {
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();
    private sourceStats: Map<string, {
        totalRequests: number;
        totalFailures: number;
        lastSuccess: Date | null;
        lastFailure: Date | null;
        lastError: string | null;
        responseTimes: number[];
    }> = new Map();
    private sourceConfigs: Map<string, SourceConfig> = new Map();
    private config: CircuitBreakerConfig;

    constructor(config: CircuitBreakerConfig) {
        super();
        this.config = config;
    }

    /**
     * Register a source for monitoring
     */
    public registerSource(source: SourceConfig): void {
        if (!this.circuitBreakers.has(source.id)) {
            this.circuitBreakers.set(
                source.id,
                new CircuitBreaker(source.id, this.config)
            );
            this.sourceStats.set(source.id, {
                totalRequests: 0,
                totalFailures: 0,
                lastSuccess: null,
                lastFailure: null,
                lastError: null,
                responseTimes: [],
            });
            this.sourceConfigs.set(source.id, source);
            logger.info(`Registered source for monitoring: ${source.id}`);
        }
    }

    /**
     * Unregister a source
     */
    public unregisterSource(sourceId: string): void {
        this.circuitBreakers.delete(sourceId);
        this.sourceStats.delete(sourceId);
        this.sourceConfigs.delete(sourceId);
        logger.info(`Unregistered source: ${sourceId}`);
    }

    /**
     * Check if a source is available for requests
     */
    public canRequest(sourceId: string): boolean {
        const breaker = this.circuitBreakers.get(sourceId);
        if (!breaker) {
            logger.warn(`Unknown source: ${sourceId}`);
            return false;
        }
        return breaker.canExecute();
    }

    /**
     * Record a successful request
     */
    public recordSuccess(sourceId: string, responseTimeMs?: number): void {
        const breaker = this.circuitBreakers.get(sourceId);
        const stats = this.sourceStats.get(sourceId);

        if (!breaker || !stats) return;

        breaker.recordSuccess(responseTimeMs);
        stats.totalRequests++;
        stats.lastSuccess = new Date();

        if (responseTimeMs !== undefined) {
            stats.responseTimes.push(responseTimeMs);
            // Keep only last 10 response times
            if (stats.responseTimes.length > 10) {
                stats.responseTimes.shift();
            }
        }

        this.emit('source:healthy', { sourceId });
    }

    /**
     * Record a failed request
     */
    public recordFailure(sourceId: string, error: string): void {
        const breaker = this.circuitBreakers.get(sourceId);
        const stats = this.sourceStats.get(sourceId);

        if (!breaker || !stats) return;

        breaker.recordFailure(error);
        stats.totalRequests++;
        stats.totalFailures++;
        stats.lastFailure = new Date();
        stats.lastError = error;

        const metrics = breaker.getMetrics();

        if (metrics.state === CircuitState.OPEN) {
            this.emit('source:unhealthy', { sourceId, error });
            this.emit('circuit:opened', { sourceId, reason: error });
        } else {
            this.emit('source:degraded', {
                sourceId,
                failures: metrics.failureCount
            });
        }
    }

    /**
     * Get health status for a specific source
     */
    public getSourceHealth(sourceId: string): SourceHealth | null {
        const breaker = this.circuitBreakers.get(sourceId);
        const stats = this.sourceStats.get(sourceId);
        const config = this.sourceConfigs.get(sourceId);

        if (!breaker || !stats || !config) return null;

        const metrics = breaker.getMetrics();
        const avgResponseTime = stats.responseTimes.length > 0
            ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
            : null;

        const uptime = stats.totalRequests > 0
            ? ((stats.totalRequests - stats.totalFailures) / stats.totalRequests) * 100
            : 100;

        return {
            sourceId,
            sourceName: config.name,
            status: this.circuitStateToHealthStatus(metrics.state),
            circuitState: metrics.state,
            consecutiveFailures: metrics.failureCount,
            consecutiveSuccesses: metrics.successCount,
            lastSuccess: stats.lastSuccess,
            lastFailure: stats.lastFailure,
            lastError: stats.lastError,
            totalRequests: stats.totalRequests,
            totalFailures: stats.totalFailures,
            uptime,
            responseTimeMs: avgResponseTime,
        };
    }

    /**
     * Get health for all sources
     */
    public getAllSourceHealth(): SourceHealth[] {
        const health: SourceHealth[] = [];

        for (const sourceId of this.circuitBreakers.keys()) {
            const h = this.getSourceHealth(sourceId);
            if (h) health.push(h);
        }

        return health;
    }

    /**
     * Get a summary for AI consumption
     */
    public getHealthSummary(): {
        totalSources: number;
        healthySources: number;
        degradedSources: number;
        unhealthySources: number;
        overallStatus: HealthStatus;
        sources: Array<{
            id: string;
            name: string;
            status: HealthStatus;
            message: string;
        }>;
    } {
        const allHealth = this.getAllSourceHealth();

        const healthy = allHealth.filter(h => h.status === HealthStatus.HEALTHY);
        const degraded = allHealth.filter(h => h.status === HealthStatus.DEGRADED);
        const unhealthy = allHealth.filter(h => h.status === HealthStatus.UNHEALTHY);

        let overallStatus = HealthStatus.HEALTHY;
        if (unhealthy.length > 0) {
            overallStatus = unhealthy.length === allHealth.length
                ? HealthStatus.UNHEALTHY
                : HealthStatus.DEGRADED;
        } else if (degraded.length > 0) {
            overallStatus = HealthStatus.DEGRADED;
        }

        return {
            totalSources: allHealth.length,
            healthySources: healthy.length,
            degradedSources: degraded.length,
            unhealthySources: unhealthy.length,
            overallStatus,
            sources: allHealth.map(h => ({
                id: h.sourceId,
                name: h.sourceName,
                status: h.status,
                message: this.getStatusMessage(h),
            })),
        };
    }

    /**
     * Force reset a source's circuit breaker
     */
    public resetSource(sourceId: string): boolean {
        const breaker = this.circuitBreakers.get(sourceId);
        if (!breaker) return false;

        breaker.reset();
        this.emit('circuit:closed', { sourceId });
        return true;
    }

    /**
     * Convert circuit state to health status
     */
    private circuitStateToHealthStatus(state: CircuitState): HealthStatus {
        switch (state) {
            case CircuitState.CLOSED:
                return HealthStatus.HEALTHY;
            case CircuitState.HALF_OPEN:
                return HealthStatus.DEGRADED;
            case CircuitState.OPEN:
                return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * Generate human-readable status message
     */
    private getStatusMessage(health: SourceHealth): string {
        switch (health.status) {
            case HealthStatus.HEALTHY:
                return `Operating normally (${health.uptime.toFixed(1)}% uptime)`;
            case HealthStatus.DEGRADED:
                return `Experiencing issues (${health.consecutiveFailures} recent failures)`;
            case HealthStatus.UNHEALTHY:
                return `Currently unavailable: ${health.lastError || 'Unknown error'}`;
        }
    }
}

// Export types
export * from './types.js';
export { CircuitBreaker } from './circuit-breaker.js';
