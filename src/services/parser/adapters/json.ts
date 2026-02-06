import { ContentAdapter, ContentType, NewsItem, ParseResult } from '../types.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('JSONAdapter');

/**
 * JSON Array Adapter
 * 
 * Handles JSON arrays of news items with flexible field mapping
 */
export class JSONAdapter implements ContentAdapter {
    readonly supportedTypes = [ContentType.JSON];

    /**
     * Check if content looks like JSON array
     */
    canParse(content: string, contentType?: string): boolean {
        // Check content-type
        if (contentType?.toLowerCase().includes('json')) {
            return true;
        }

        // Sniff content
        const trimmed = content.trim();
        return trimmed.startsWith('[') || trimmed.startsWith('{');
    }

    /**
     * Parse JSON content
     */
    async parse(
        content: string,
        sourceId: string,
        sourceName: string,
        options?: Record<string, unknown>
    ): Promise<ParseResult> {
        try {
            const parsed = JSON.parse(content);

            // Handle array directly or nested in object
            let items: unknown[] = [];
            let metadata: Record<string, unknown> = {};

            if (Array.isArray(parsed)) {
                items = parsed;
            } else if (typeof parsed === 'object' && parsed !== null) {
                // Look for common array keys
                const arrayKeys = ['items', 'data', 'entries', 'articles', 'posts', 'news', 'results'];
                for (const key of arrayKeys) {
                    if (Array.isArray(parsed[key])) {
                        items = parsed[key];
                        metadata = { ...parsed };
                        delete metadata[key];
                        break;
                    }
                }

                if (items.length === 0) {
                    // Maybe it's a single item
                    items = [parsed];
                }
            }

            const newsItems: NewsItem[] = [];

            for (const item of items) {
                try {
                    const newsItem = this.mapToNewsItem(item, sourceId, sourceName, options);
                    if (newsItem) newsItems.push(newsItem);
                } catch (e) {
                    logger.warn(`Skipping malformed JSON item: ${e}`);
                }
            }

            return {
                success: true,
                items: newsItems,
                contentType: ContentType.JSON,
                metadata: {
                    title: this.getString(metadata, ['title', 'name']),
                    description: this.getString(metadata, ['description', 'subtitle']),
                    link: this.getString(metadata, ['link', 'url', 'homepage']),
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown parse error';
            logger.error(`JSON parse error: ${message}`);
            return {
                success: false,
                items: [],
                contentType: ContentType.JSON,
                error: message,
            };
        }
    }

    /**
     * Map a raw JSON object to NewsItem
     */
    private mapToNewsItem(
        item: unknown,
        sourceId: string,
        sourceName: string,
        _options?: Record<string, unknown>
    ): NewsItem | null {
        if (!item || typeof item !== 'object') return null;

        const obj = item as Record<string, unknown>;

        // Flexible field mapping
        const link = this.getString(obj, ['link', 'url', 'href', 'permalink']);
        const title = this.getString(obj, ['title', 'name', 'headline']);

        if (!link && !title) return null;

        const id = this.getString(obj, ['id', 'guid', 'uuid']) ||
            link ||
            this.hashObject(obj);

        const publishedStr = this.getString(obj, [
            'publishedAt', 'published_at', 'pubDate', 'date',
            'created', 'createdAt', 'created_at', 'timestamp'
        ]);

        return {
            id,
            title: title || 'Untitled',
            link: link || '',
            description: this.getString(obj, ['description', 'summary', 'excerpt', 'snippet']),
            content: this.getString(obj, ['content', 'body', 'text', 'full_text']),
            author: this.getString(obj, ['author', 'creator', 'by', 'writer']),
            publishedAt: publishedStr ? new Date(publishedStr) : undefined,
            categories: this.getArray(obj, ['categories', 'tags', 'topics', 'labels']),
            sourceId,
            sourceName,
            imageUrl: this.getString(obj, ['image', 'imageUrl', 'thumbnail', 'cover', 'media']),
            metadata: this.extractMetadata(obj),
        };
    }

    /**
     * Get string from object with fallback keys
     */
    private getString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const key of keys) {
            const value = obj[key];
            if (value !== undefined && value !== null) {
                if (typeof value === 'string') return value;
                if (typeof value === 'object' && 'url' in value) {
                    return String((value as Record<string, unknown>).url);
                }
                return String(value);
            }
        }
        return undefined;
    }

    /**
     * Get array from object with fallback keys
     */
    private getArray(obj: Record<string, unknown>, keys: string[]): string[] {
        for (const key of keys) {
            const value = obj[key];
            if (Array.isArray(value)) {
                return value.map(v => String(v));
            }
        }
        return [];
    }

    /**
     * Extract extra metadata fields
     */
    private extractMetadata(obj: Record<string, unknown>): Record<string, unknown> {
        const knownFields = new Set([
            'id', 'guid', 'uuid', 'title', 'name', 'headline',
            'link', 'url', 'href', 'description', 'summary',
            'content', 'body', 'author', 'creator', 'publishedAt',
            'published_at', 'pubDate', 'date', 'categories', 'tags',
            'image', 'imageUrl', 'thumbnail',
        ]);

        const metadata: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (!knownFields.has(key)) {
                metadata[key] = value;
            }
        }
        return metadata;
    }

    /**
     * Simple hash for object-based ID
     */
    private hashObject(obj: Record<string, unknown>): string {
        const str = JSON.stringify(obj);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `json-${Math.abs(hash)}`;
    }
}
