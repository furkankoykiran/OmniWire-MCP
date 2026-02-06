import { RSSAdapter } from './adapters/rss.js';
import { JSONAdapter } from './adapters/json.js';
import { HTMLAdapter } from './adapters/html.js';
import { ContentAdapter, ContentType, ParseResult } from './types.js';
import { SourceConfig } from '../../config/schema.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('UniversalParser');

/**
 * Universal Parser: Smart Content Sniffing and Adaptation
 * 
 * Features:
 * - Automatic content type detection
 * - Routes to appropriate adapter
 * - Normalizes all content to NewsItem format
 * - Error-tolerant parsing
 */
export class UniversalParser {
    private adapters: ContentAdapter[];

    constructor() {
        // Order matters - RSS first (most common), then JSON, then HTML
        this.adapters = [
            new RSSAdapter(),
            new JSONAdapter(),
            new HTMLAdapter(),
        ];
    }

    /**
     * Detect content type from content and headers
     */
    public detectContentType(content: string, contentTypeHeader?: string): ContentType {
        // Check explicit type hint in header
        if (contentTypeHeader) {
            const lower = contentTypeHeader.toLowerCase();
            if (lower.includes('rss') || lower.includes('atom')) return ContentType.RSS;
            if (lower.includes('json')) return ContentType.JSON;
            if (lower.includes('html')) return ContentType.HTML;
            if (lower.includes('xml')) {
                // Could be RSS or Atom
                return content.includes('<feed') ? ContentType.ATOM : ContentType.RSS;
            }
        }

        // Sniff content
        const trimmed = content.trim();

        // XML-based (RSS/Atom)
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
            return trimmed.includes('<feed') ? ContentType.ATOM : ContentType.RSS;
        }

        // JSON
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            return ContentType.JSON;
        }

        // HTML
        if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
            return ContentType.HTML;
        }

        return ContentType.UNKNOWN;
    }

    /**
     * Parse content from a source
     */
    public async parse(
        content: string,
        source: SourceConfig,
        contentTypeHeader?: string
    ): Promise<ParseResult> {
        // Determine content type
        let contentType: ContentType;

        if (source.type === 'auto') {
            contentType = this.detectContentType(content, contentTypeHeader);
        } else {
            contentType = source.type as ContentType;
        }

        logger.debug(`Parsing ${source.id} as ${contentType}`);

        // Find appropriate adapter
        const adapter = this.findAdapter(content, contentType, contentTypeHeader);

        if (!adapter) {
            return {
                success: false,
                items: [],
                contentType: ContentType.UNKNOWN,
                error: `No adapter found for content type: ${contentType}`,
            };
        }

        // Parse with options
        const result = await adapter.parse(
            content,
            source.id,
            source.name,
            {
                selector: source.selector,
                baseUrl: source.url,
            }
        );

        logger.info(`Parsed ${result.items.length} items from ${source.id}`);

        return result;
    }

    /**
     * Fetch and parse a source
     */
    public async fetchAndParse(
        source: SourceConfig,
        timeoutMs: number = 10000
    ): Promise<{ result: ParseResult; responseTimeMs: number }> {
        const startTime = Date.now();

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(source.url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/rss+xml, application/atom+xml, application/json, text/html, */*',
                    'User-Agent': 'OmniWire-MCP/1.0 (News Aggregator)',
                },
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const content = await response.text();
            const contentTypeHeader = response.headers.get('content-type') || undefined;

            const result = await this.parse(content, source, contentTypeHeader);
            const responseTimeMs = Date.now() - startTime;

            return { result, responseTimeMs };
        } catch (error) {
            const responseTimeMs = Date.now() - startTime;
            const message = error instanceof Error ? error.message : 'Unknown error';

            logger.error(`Failed to fetch ${source.id}: ${message}`);

            return {
                result: {
                    success: false,
                    items: [],
                    contentType: ContentType.UNKNOWN,
                    error: message,
                },
                responseTimeMs,
            };
        }
    }

    /**
     * Find the best adapter for the content
     */
    private findAdapter(
        content: string,
        detectedType: ContentType,
        contentTypeHeader?: string
    ): ContentAdapter | null {
        // First, try to find adapter for detected type
        for (const adapter of this.adapters) {
            if (adapter.supportedTypes.includes(detectedType) && adapter.canParse(content, contentTypeHeader)) {
                return adapter;
            }
        }

        // Fallback: try all adapters
        for (const adapter of this.adapters) {
            if (adapter.canParse(content, contentTypeHeader)) {
                return adapter;
            }
        }

        return null;
    }
}

// Export types
export * from './types.js';
export { RSSAdapter } from './adapters/rss.js';
export { JSONAdapter } from './adapters/json.js';
export { HTMLAdapter } from './adapters/html.js';
