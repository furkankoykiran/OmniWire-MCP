import { XMLParser } from 'fast-xml-parser';
import { ContentAdapter, ContentType, NewsItem, ParseResult } from '../types.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('RSSAdapter');

/**
 * RSS/Atom Feed Adapter
 * 
 * Handles both RSS 2.0 and Atom feed formats
 */
export class RSSAdapter implements ContentAdapter {
    readonly supportedTypes = [ContentType.RSS, ContentType.ATOM];

    private parser: XMLParser;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text',
            parseTagValue: true,
            trimValues: true,
        });
    }

    /**
     * Check if content looks like RSS/Atom
     */
    canParse(content: string, contentType?: string): boolean {
        // Check content-type header
        if (contentType) {
            const lower = contentType.toLowerCase();
            if (lower.includes('rss') || lower.includes('atom') || lower.includes('xml')) {
                return true;
            }
        }

        // Sniff content
        const trimmed = content.trim();
        return (
            trimmed.startsWith('<?xml') ||
            trimmed.includes('<rss') ||
            trimmed.includes('<feed') ||
            trimmed.includes('<channel>')
        );
    }

    /**
     * Parse RSS/Atom feed
     */
    async parse(
        content: string,
        sourceId: string,
        sourceName: string
    ): Promise<ParseResult> {
        try {
            const parsed = this.parser.parse(content);

            // Detect format and extract items
            if (parsed.rss?.channel) {
                return this.parseRSS(parsed.rss.channel, sourceId, sourceName);
            } else if (parsed.feed) {
                return this.parseAtom(parsed.feed, sourceId, sourceName);
            } else if (parsed.channel) {
                // Some feeds have channel at root
                return this.parseRSS(parsed.channel, sourceId, sourceName);
            }

            return {
                success: false,
                items: [],
                contentType: ContentType.UNKNOWN,
                error: 'Unable to detect RSS/Atom structure',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown parse error';
            logger.error(`RSS parse error: ${message}`);
            return {
                success: false,
                items: [],
                contentType: ContentType.RSS,
                error: message,
            };
        }
    }

    /**
     * Parse RSS 2.0 format
     */
    private parseRSS(
        channel: Record<string, unknown>,
        sourceId: string,
        sourceName: string
    ): ParseResult {
        const rawItems = this.ensureArray(channel.item);
        const items: NewsItem[] = [];

        for (const item of rawItems) {
            try {
                const newsItem = this.parseRSSItem(item, sourceId, sourceName);
                if (newsItem) items.push(newsItem);
            } catch (e) {
                logger.warn(`Skipping malformed RSS item: ${e}`);
            }
        }

        return {
            success: true,
            items,
            contentType: ContentType.RSS,
            metadata: {
                title: this.getString(channel.title),
                description: this.getString(channel.description),
                link: this.getString(channel.link),
                lastBuildDate: this.parseDate(channel.lastBuildDate),
            },
        };
    }

    /**
     * Parse Atom format
     */
    private parseAtom(
        feed: Record<string, unknown>,
        sourceId: string,
        sourceName: string
    ): ParseResult {
        const rawItems = this.ensureArray(feed.entry);
        const items: NewsItem[] = [];

        for (const entry of rawItems) {
            try {
                const newsItem = this.parseAtomEntry(entry, sourceId, sourceName);
                if (newsItem) items.push(newsItem);
            } catch (e) {
                logger.warn(`Skipping malformed Atom entry: ${e}`);
            }
        }

        return {
            success: true,
            items,
            contentType: ContentType.ATOM,
            metadata: {
                title: this.getString(feed.title),
                description: this.getString(feed.subtitle),
                link: this.getAtomLink(feed.link),
            },
        };
    }

    /**
     * Parse individual RSS item
     */
    private parseRSSItem(
        item: Record<string, unknown>,
        sourceId: string,
        sourceName: string
    ): NewsItem | null {
        const link = this.getString(item.link);
        const title = this.getString(item.title);

        if (!link && !title) return null;

        const id = this.getString(item.guid) || link || this.hashString(title || '');

        return {
            id,
            title: title || 'Untitled',
            link: link || '',
            description: this.getString(item.description),
            content: this.getString(item['content:encoded']),
            author: this.getString(item.author) || this.getString(item['dc:creator']),
            publishedAt: this.parseDate(item.pubDate),
            categories: this.extractCategories(item.category),
            sourceId,
            sourceName,
            imageUrl: this.extractRSSImage(item),
        };
    }

    /**
     * Parse individual Atom entry
     */
    private parseAtomEntry(
        entry: Record<string, unknown>,
        sourceId: string,
        sourceName: string
    ): NewsItem | null {
        const link = this.getAtomLink(entry.link);
        const title = this.getString(entry.title);

        if (!link && !title) return null;

        const id = this.getString(entry.id) || link || this.hashString(title || '');

        return {
            id,
            title: title || 'Untitled',
            link: link || '',
            description: this.getString(entry.summary),
            content: this.getAtomContent(entry.content),
            author: this.getAtomAuthor(entry.author),
            publishedAt: this.parseDate(entry.published) || this.parseDate(entry.updated),
            categories: this.extractAtomCategories(entry.category),
            sourceId,
            sourceName,
        };
    }

    // Helper methods
    private ensureArray(value: unknown): Record<string, unknown>[] {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return [value as Record<string, unknown>];
    }

    private getString(value: unknown): string | undefined {
        if (!value) return undefined;
        if (typeof value === 'string') return value;
        if (typeof value === 'object' && value !== null) {
            const obj = value as Record<string, unknown>;
            if ('#text' in obj) return String(obj['#text']);
        }
        return String(value);
    }

    private parseDate(value: unknown): Date | undefined {
        if (!value) return undefined;
        const str = this.getString(value);
        if (!str) return undefined;
        const date = new Date(str);
        return isNaN(date.getTime()) ? undefined : date;
    }

    private getAtomLink(links: unknown): string | undefined {
        const linkArray = this.ensureArray(links);
        // Prefer alternate link
        const alternate = linkArray.find(
            l => l['@_rel'] === 'alternate' || !l['@_rel']
        );
        const link = alternate || linkArray[0];
        return link ? this.getString(link['@_href']) : undefined;
    }

    private getAtomContent(content: unknown): string | undefined {
        if (!content) return undefined;
        if (typeof content === 'string') return content;
        if (typeof content === 'object' && content !== null) {
            const obj = content as Record<string, unknown>;
            return this.getString(obj['#text']);
        }
        return undefined;
    }

    private getAtomAuthor(author: unknown): string | undefined {
        if (!author) return undefined;
        if (typeof author === 'string') return author;
        if (typeof author === 'object' && author !== null) {
            const obj = author as Record<string, unknown>;
            return this.getString(obj.name);
        }
        return undefined;
    }

    private extractCategories(categories: unknown): string[] {
        return this.ensureArray(categories)
            .map(c => this.getString(c))
            .filter((c): c is string => !!c);
    }

    private extractAtomCategories(categories: unknown): string[] {
        return this.ensureArray(categories)
            .map(c => this.getString((c as Record<string, unknown>)['@_term']))
            .filter((c): c is string => !!c);
    }

    private extractRSSImage(item: Record<string, unknown>): string | undefined {
        // Check enclosure
        const enclosure = item.enclosure as Record<string, unknown> | undefined;
        if (enclosure?.['@_type']?.toString().startsWith('image')) {
            return this.getString(enclosure['@_url']);
        }
        // Check media:content
        const media = item['media:content'] as Record<string, unknown> | undefined;
        if (media) {
            return this.getString(media['@_url']);
        }
        return undefined;
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `hash-${Math.abs(hash)}`;
    }
}
