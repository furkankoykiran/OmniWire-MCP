import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { AppConfig, AppConfigSchema, DEFAULT_CONFIG } from './schema.js';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);

/**
 * ConfigLoader: Dynamic configuration management with hot-reload
 * 
 * Features:
 * - Fetches configuration from remote URL (RSS_FEEDS env var)
 * - Polls for changes at configurable intervals
 * - Validates config with Zod schemas
 * - Emits 'config:changed' event on updates
 * - Fallback to local defaults if no remote config provided
 */
export class ConfigLoader extends EventEmitter {
    private config: AppConfig;
    private configUrl: string | null;
    private pollTimer: NodeJS.Timeout | null = null;
    private lastConfigHash: string = '';

    constructor() {
        super();
        this.configUrl = process.env.RSS_FEEDS || null;
        this.config = DEFAULT_CONFIG;
    }

    /**
     * Get current configuration
     */
    public getConfig(): AppConfig {
        return this.config;
    }

    /**
   * Initialize the config loader and start polling
   */
    public async initialize(): Promise<void> {
        if (!this.configUrl) {
            logger.info('RSS_FEEDS environment variable not set, attempting to load local default configuration');
            this.loadDefaultConfig();
            return;
        }

        // Check if RSS_FEEDS is a JSON string (starts with { or [)
        if (this.configUrl.trim().startsWith('{') || this.configUrl.trim().startsWith('[')) {
            logger.info('RSS_FEEDS detected as JSON string, parsing directly');
            try {
                const rawData = JSON.parse(this.configUrl);
                const validated = AppConfigSchema.parse(rawData);
                this.config = validated;
                logger.info(`Loaded configuration from environment JSON: ${validated.sources.length} sources`);
            } catch (error) {
                logger.error(`Failed to parse JSON from RSS_FEEDS var: ${error}`);
                // Fallback to defaults
                this.loadDefaultConfig();
            }
            return;
        }

        logger.info(`Loading configuration from URL: ${this.configUrl}`);
        await this.loadRemoteConfig();
        this.startPolling();
    }

    private loadDefaultConfig() {
        try {
            // Load default feeds.json from local defaults directory
            const defaultConfig = require('./defaults/feeds.json');

            // Validate it just like remote config
            const validated = AppConfigSchema.parse(defaultConfig);
            this.config = validated;

            logger.info(`Loaded local default configuration with ${validated.sources.length} sources`);
        } catch (error) {
            logger.warn(`Failed to load valid default configuration: ${error}. Using empty defaults.`);
        }
    }

    /**
     * Force a config reload
     */
    public async refresh(): Promise<boolean> {
        if (!this.configUrl) {
            logger.info('Refreshed local config (no-op when using defaults/env-json)');
            return true;
        }

        // If it's a URL, reload it
        if (!this.configUrl.trim().startsWith('{') && !this.configUrl.trim().startsWith('[')) {
            return this.loadRemoteConfig();
        }

        return true;
    }

    /**
     * Stop polling and cleanup
     */
    public stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Fetch and validate remote configuration
     */
    private async loadRemoteConfig(): Promise<boolean> {
        if (!this.configUrl) return false;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(this.configUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'OmniWire-MCP/1.0',
                },
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const rawData = await response.json();
            const configHash = this.hashConfig(rawData);

            // Skip if config hasn't changed
            if (configHash === this.lastConfigHash) {
                logger.debug('Config unchanged, skipping update');
                return true;
            }

            // Validate with Zod
            const validatedConfig = AppConfigSchema.parse(rawData);

            const previousConfig = this.config;
            this.config = validatedConfig;
            this.lastConfigHash = configHash;

            logger.info(`Configuration loaded successfully: ${validatedConfig.sources.length} sources`);

            // Emit change event with old and new config
            this.emit('config:changed', {
                previous: previousConfig,
                current: validatedConfig,
                addedSources: this.getAddedSources(previousConfig, validatedConfig),
                removedSources: this.getRemovedSources(previousConfig, validatedConfig),
            });

            return true;
        } catch (error) {
            if (error instanceof Error) {
                logger.error(`Failed to load remote config: ${error.message}`);
            }
            return false;
        }
    }

    /**
     * Start polling for config changes
     */
    private startPolling(): void {
        const interval = this.config.configPollIntervalMs;
        logger.info(`Starting config polling every ${interval / 1000}s`);

        this.pollTimer = setInterval(async () => {
            await this.loadRemoteConfig();
        }, interval);
    }

    /**
     * Simple hash for config comparison
     */
    private hashConfig(data: unknown): string {
        return JSON.stringify(data);
    }

    /**
     * Find sources that were added
     */
    private getAddedSources(prev: AppConfig, curr: AppConfig): string[] {
        const prevIds = new Set(prev.sources.map(s => s.id));
        return curr.sources.filter(s => !prevIds.has(s.id)).map(s => s.id);
    }

    /**
     * Find sources that were removed
     */
    private getRemovedSources(prev: AppConfig, curr: AppConfig): string[] {
        const currIds = new Set(curr.sources.map(s => s.id));
        return prev.sources.filter(s => !currIds.has(s.id)).map(s => s.id);
    }
}

// Singleton instance
export const configLoader = new ConfigLoader();
