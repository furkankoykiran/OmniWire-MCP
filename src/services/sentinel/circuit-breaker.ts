import { CircuitState, CircuitBreakerConfig } from './types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('CircuitBreaker');

/**
 * Circuit Breaker Pattern Implementation
 * 
 * Protects the system from cascading failures by:
 * 1. CLOSED: Normal operation, tracking failures
 * 2. OPEN: Blocking requests after threshold reached
 * 3. HALF_OPEN: Testing if service has recovered
 */
export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime: Date | null = null;
    private lastStateChange: Date = new Date();
    private nextAttemptTime: Date | null = null;

    constructor(
        private readonly sourceId: string,
        private readonly config: CircuitBreakerConfig
    ) { }

    /**
     * Get current circuit state
     */
    public getState(): CircuitState {
        // Check if we should transition from OPEN to HALF_OPEN
        if (this.state === CircuitState.OPEN && this.shouldAttemptRecovery()) {
            this.transitionTo(CircuitState.HALF_OPEN);
        }
        return this.state;
    }

    /**
     * Check if request should be allowed
     */
    public canExecute(): boolean {
        const currentState = this.getState();

        if (currentState === CircuitState.CLOSED) {
            return true;
        }

        if (currentState === CircuitState.HALF_OPEN) {
            // Allow one test request
            return true;
        }

        // OPEN state - check if recovery timeout has passed
        if (this.shouldAttemptRecovery()) {
            this.transitionTo(CircuitState.HALF_OPEN);
            return true;
        }

        return false;
    }

    /**
     * Record a successful request
     */
    public recordSuccess(_responseTimeMs?: number): void {
        this.successCount++;
        this.failureCount = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            if (this.successCount >= this.config.successThreshold) {
                this.transitionTo(CircuitState.CLOSED);
                logger.info(`Circuit closed for source ${this.sourceId} after ${this.successCount} successes`);
            }
        }
    }

    /**
     * Record a failed request
     */
    public recordFailure(error: string): void {
        this.failureCount++;
        this.successCount = 0;
        this.lastFailureTime = new Date();

        logger.warn(`Failure recorded for ${this.sourceId}: ${error} (${this.failureCount}/${this.config.failureThreshold})`);

        if (this.state === CircuitState.HALF_OPEN) {
            // Immediate transition back to OPEN on any failure
            this.transitionTo(CircuitState.OPEN);
            logger.warn(`Circuit reopened for source ${this.sourceId}`);
        } else if (this.failureCount >= this.config.failureThreshold) {
            this.transitionTo(CircuitState.OPEN);
            logger.error(`Circuit opened for source ${this.sourceId} after ${this.failureCount} failures`);
        }
    }

    /**
     * Force reset the circuit breaker
     */
    public reset(): void {
        this.transitionTo(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
        logger.info(`Circuit manually reset for source ${this.sourceId}`);
    }

    /**
     * Get metrics for reporting
     */
    public getMetrics() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            lastStateChange: this.lastStateChange,
            nextAttemptTime: this.nextAttemptTime,
        };
    }

    /**
     * Check if we should attempt recovery (OPEN -> HALF_OPEN)
     */
    private shouldAttemptRecovery(): boolean {
        if (this.state !== CircuitState.OPEN || !this.nextAttemptTime) {
            return false;
        }
        return new Date() >= this.nextAttemptTime;
    }

    /**
     * Transition to a new state
     */
    private transitionTo(newState: CircuitState): void {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = new Date();

        if (newState === CircuitState.OPEN) {
            this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeoutMs);
        } else {
            this.nextAttemptTime = null;
        }

        if (newState === CircuitState.CLOSED) {
            this.failureCount = 0;
            this.successCount = 0;
        }

        logger.debug(`Circuit ${this.sourceId}: ${oldState} -> ${newState}`);
    }
}
