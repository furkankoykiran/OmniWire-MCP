import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SentinelService } from '../services/sentinel/index.js';
import { UniversalParser } from '../services/parser/index.js';
import { ConfigLoader } from '../config/index.js';

/**
 * Register MCP tools
 */
export function registerTools(
    server: McpServer,
    services: {
        sentinel: SentinelService;
        parser: UniversalParser;
        config: ConfigLoader;
    }
) {
    // 1. fetch-news - Smart news fetching with filtering
    server.tool(
        'fetch-news',
        {
            filter: z.string().optional().describe('Keyword to filter titles/descriptions by'),
            sourceId: z.string().optional().describe('Specific source ID to fetch from'),
            limit: z.number().min(1).max(100).default(10).describe('Max items to return'),
        },
        async ({ filter, sourceId, limit }) => {
            const config = services.config.getConfig();
            let targetSources = config.sources.filter(s => s.enabled);

            // Filter by source URI if provided
            if (sourceId) {
                targetSources = targetSources.filter(s => s.id === sourceId);
                if (targetSources.length === 0) {
                    return {
                        content: [{ type: 'text', text: `Source '${sourceId}' not found or disabled.` }],
                        isError: true,
                    };
                }
            }

            // Filter out unhealthy sources (Sentinel protection)
            const healthySources = targetSources.filter(s => services.sentinel.canRequest(s.id));

            if (healthySources.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No healthy sources available to fulfill request.' }],
                    isError: true,
                };
            }

            // Fetch in parallel
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
                        services.sentinel.recordFailure(source.id, result.error || 'Unknown error');
                        return [];
                    }
                })
            );

            // Aggregate
            let allItems = results
                .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
                .flatMap(r => r.value);

            // Apply text filter
            if (filter) {
                const lowerFilter = filter.toLowerCase();
                allItems = allItems.filter(item =>
                    item.title.toLowerCase().includes(lowerFilter) ||
                    item.description?.toLowerCase().includes(lowerFilter) ||
                    item.content?.toLowerCase().includes(lowerFilter)
                );
            }

            // Sort by date (newest first)
            allItems.sort((a, b) => {
                const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
                return dateB - dateA;
            });

            // Limit
            const slicedItems = allItems.slice(0, limit);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(slicedItems, null, 2)
                    }
                ]
            };
        }
    );

    // 2. check-health - specific diagnostic tool
    server.tool(
        'check-health',
        {
            sourceId: z.string().optional().describe('Specific source to check, or all if omitted'),
        },
        async ({ sourceId }) => {
            if (sourceId) {
                const health = services.sentinel.getSourceHealth(sourceId);
                if (!health) {
                    return {
                        content: [{ type: 'text', text: `Source '${sourceId}' unknown.` }],
                        isError: true,
                    };
                }
                return {
                    content: [{ type: 'text', text: JSON.stringify(health, null, 2) }]
                };
            }

            const summary = services.sentinel.getHealthSummary();
            return {
                content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
            };
        }
    );

    // 3. refresh-config - Force config reload
    server.tool(
        'refresh-config',
        {},
        async () => {
            const success = await services.config.refresh();
            if (success) {
                return {
                    content: [{ type: 'text', text: 'Configuration successfully reloaded from remote source.' }]
                };
            } else {
                return {
                    content: [{ type: 'text', text: 'Failed to reload configuration. Check server logs.' }],
                    isError: true,
                };
            }
        }
    );

    // 4. reset-source - Reset circuit breaker for a source
    server.tool(
        'reset-source',
        {
            sourceId: z.string().describe('Source ID to reset'),
        },
        async ({ sourceId }) => {
            const result = services.sentinel.resetSource(sourceId);
            if (result) {
                return {
                    content: [{ type: 'text', text: `Circuit breaker for source '${sourceId}' has been reset.` }]
                };
            } else {
                return {
                    content: [{ type: 'text', text: `Source '${sourceId}' not found.` }],
                    isError: true,
                };
            }
        }
    );
}
