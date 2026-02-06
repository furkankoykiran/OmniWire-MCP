import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigLoader } from '../config/index.js';
import { SentinelService } from '../services/sentinel/index.js';
import { UniversalParser } from '../services/parser/index.js';
import { createLogger } from '../utils/logger.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';
import { registerPrompts } from './prompts.js';

const logger = createLogger('OmniWireServer');

/**
 * OmniWire MCP Server
 * 
 * Orchestrates:
 * - ConfigLoader (Configuration)
 * - SentinelService (Health & Reliability)
 * - UniversalParser (Data Acquisition)
 * - MCP Interface (Resources, Tools, Prompts)
 */
export class OmniWireServer {
    private server: McpServer;
    private configLoader: ConfigLoader;
    private sentinel: SentinelService;
    private parser: UniversalParser;

    constructor() {
        // Initialize Core Services
        this.configLoader = new ConfigLoader();
        const config = this.configLoader.getConfig();

        this.sentinel = new SentinelService(config.sentinel);
        this.parser = new UniversalParser();

        // Initialize MCP Server
        this.server = new McpServer({
            name: 'OmniWire-MCP',
            version: '1.0.0',
        });

        // Wire up components
        this.initializeMcp();
        this.setupEventListeners();
    }

    /**
     * Register all MCP capabilities
     */
    private initializeMcp() {
        const services = {
            sentinel: this.sentinel,
            parser: this.parser,
            config: this.configLoader,
        };

        registerResources(this.server, services);
        registerTools(this.server, services);
        registerPrompts(this.server, services);
    }

    /**
     * Setup internal event orchestration
     */
    private setupEventListeners() {
        // Config changes update Sentinel
        this.configLoader.on('config:changed', ({ current, addedSources, removedSources }) => {
            logger.info('Configuration updated, adjusting services...');

            // Update Sentinel with new sources
            current.sources.forEach((source: any) => {
                if (addedSources.includes(source.id)) {
                    this.sentinel.registerSource(source);
                }
            });

            // Remove old sources
            removedSources.forEach((id: string) => {
                this.sentinel.unregisterSource(id);
            });
        });

        // Sentinel events logging
        this.sentinel.on('source:unhealthy', ({ sourceId, error }) => {
            logger.warn(`Sentinel Alert: Source ${sourceId} is unhealthy: ${error}`);
        });

        this.sentinel.on('circuit:opened', ({ sourceId }) => {
            logger.warn(`Circuit Breaker OPEN for ${sourceId}`);
        });

        this.sentinel.on('circuit:closed', ({ sourceId }) => {
            logger.info(`Circuit Breaker CLOSED (Recovered) for ${sourceId}`);
        });
    }

    /**
     * Start the server
     */
    public async start() {
        try {
            // 1. Initialize Config (fetch remote or use default)
            await this.configLoader.initialize();

            // 2. Register initial sources with Sentinel
            const config = this.configLoader.getConfig();
            config.sources.forEach(source => {
                if (source.enabled) {
                    this.sentinel.registerSource(source);
                }
            });

            // 3. Start Transport
            const transport = new StdioServerTransport();
            await this.server.connect(transport);

            logger.info('OmniWire MCP Server running on stdio');
        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }
}
