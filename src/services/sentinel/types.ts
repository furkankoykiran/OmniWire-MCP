/**
 * Circuit Breaker States
 */
export enum CircuitState {
    /** Circuit is closed, requests flow normally */
    CLOSED = 'CLOSED',
    /** Circuit is open, requests are blocked */
    OPEN = 'OPEN',
    /** Circuit is testing if service recovered */
    HALF_OPEN = 'HALF_OPEN',
}

/**
 * Health status for display to AI
 */
export enum HealthStatus {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy',
}

/**
 * Source health metrics
 */
export interface SourceHealth {
    sourceId: string;
    sourceName: string;
    status: HealthStatus;
    circuitState: CircuitState;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastSuccess: Date | null;
    lastFailure: Date | null;
    lastError: string | null;
    totalRequests: number;
    totalFailures: number;
    uptime: number; // Percentage 0-100
    responseTimeMs: number | null;
}

/**
 * Circuit Breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Number of failures to open the circuit */
    failureThreshold: number;
    /** Time in ms before attempting recovery */
    recoveryTimeoutMs: number;
    /** Number of successes needed to close circuit */
    successThreshold: number;
}

/**
 * Sentinel event types
 */
export interface SentinelEvents {
    'source:healthy': { sourceId: string };
    'source:degraded': { sourceId: string; failures: number };
    'source:unhealthy': { sourceId: string; error: string };
    'circuit:opened': { sourceId: string; reason: string };
    'circuit:closed': { sourceId: string };
    'circuit:half-open': { sourceId: string };
}
