import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SentinelService } from '../services/sentinel/index.js';
import { UniversalParser } from '../services/parser/index.js';
import { ConfigLoader } from '../config/index.js';

/**
 * Register MCP resources
 */
export function registerResources(
    server: McpServer,
    services: {
        sentinel: SentinelService;
        parser: UniversalParser;
        config: ConfigLoader;
    }
) {
    // 1. health://sources - Get comprehensive health status
    server.resource(
        'source-health',
        'health://sources',
        {
            description: 'Real-time health status of all data sources (Sentinel Monitor)',
            mimeType: 'application/json',
        },
        async () => {
            const summary = services.sentinel.getHealthSummary();
            return {
                contents: [
                    {
                        uri: 'health://sources',
                        mimeType: 'application/json',
                        text: JSON.stringify(summary, null, 2),
                    },
                ],
            };
        }
    );

    // 2. news://all - Aggregate latest news from all healthy sources
    server.resource(
        'news-all',
        'news://all',
        {
            description: 'Latest news items combined from all healthy sources',
            mimeType: 'application/json',
        },
        async () => {
            const config = services.config.getConfig();
            const healthySources = config.sources.filter(s =>
                s.enabled && services.sentinel.canRequest(s.id)
            );

            const allItems = [];
            const stats = {
                attempted: healthySources.length,
                successful: 0,
                failed: 0,
            };

            // Parallel fetch from healthy sources
            const results = await Promise.allSettled(
                healthySources.map(async (source) => {
                    const { result, responseTimeMs } = await services.parser.fetchAndParse(
                        source,
                        config.requestTimeoutMs
                    );

                    if (result.success) {
                        services.sentinel.recordSuccess(source.id, responseTimeMs);
                        return result.items;
                    } else {
                        services.sentinel.recordFailure(source.id, result.error || 'Unknown parsing error');
                        throw new Error(result.error);
                    }
                })
            );

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    allItems.push(...result.value);
                    stats.successful++;
                } else {
                    stats.failed++;
                }
            }

            // Sort by date (newest first)
            allItems.sort((a, b) => {
                const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
                return dateB - dateA;
            });

            return {
                contents: [
                    {
                        uri: 'news://all',
                        mimeType: 'application/json',
                        text: JSON.stringify({
                            meta: {
                                totalCount: allItems.length,
                                sources: stats,
                                generatedAt: new Date().toISOString(),
                            },
                            items: allItems,
                        }, null, 2),
                    },
                ],
            };
        }
    );

    // 3. news://source/{id} - Get news from a specific source
    server.resource(
        'news-source',
        new ResourceTemplate('news://source/{sourceId}', { list: undefined }),
        {
            description: 'Latest news from a specific source ID',
            mimeType: 'application/json',
        },
        async (uri, { sourceId }) => {
            if (typeof sourceId !== 'string') {
                throw new Error('Invalid source ID');
            }

            const config = services.config.getConfig();
            const source = config.sources.find(s => s.id === sourceId);

            if (!source) {
                throw new Error(`Source not found: ${sourceId}`);
            }

            const { result, responseTimeMs } = await services.parser.fetchAndParse(
                source,
                config.requestTimeoutMs
            );

            if (result.success) {
                services.sentinel.recordSuccess(sourceId, responseTimeMs);
            } else {
                services.sentinel.recordFailure(sourceId, result.error || 'Parse error');
            }

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
    );

    // 4. config://current - View current configuration
    server.resource(
        'config-current',
        'config://current',
        {
            description: 'Current active configuration',
            mimeType: 'application/json',
        },
        async () => {
            return {
                contents: [
                    {
                        uri: 'config://current',
                        mimeType: 'application/json',
                        text: JSON.stringify(services.config.getConfig(), null, 2),
                    },
                ],
            };
        }
    );
}
