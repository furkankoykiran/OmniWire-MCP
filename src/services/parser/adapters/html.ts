import { parse as parseHTML, HTMLElement } from 'node-html-parser';
import { ContentAdapter, ContentType, NewsItem, ParseResult } from '../types.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('HTMLAdapter');

/**
 * HTML Scraper Adapter
 * 
 * Extracts news items from HTML pages using CSS selectors
 */
export class HTMLAdapter implements ContentAdapter {
    readonly supportedTypes = [ContentType.HTML];

    /**
     * Check if content looks like HTML
     */
    canParse(content: string, contentType?: string): boolean {
        if (contentType?.toLowerCase().includes('html')) {
            return true;
        }

        const trimmed = content.trim().toLowerCase();
        return (
            trimmed.startsWith('<!doctype') ||
            trimmed.startsWith('<html') ||
            trimmed.includes('<body')
        );
    }

    /**
     * Parse HTML content
     */
    async parse(
        content: string,
        sourceId: string,
        sourceName: string,
        options?: Record<string, unknown>
    ): Promise<ParseResult> {
        try {
            const root = parseHTML(content);

            // Get selector from options or use defaults
            const selector = (options?.selector as string) || this.detectItemSelector(root);

            if (!selector) {
                return {
                    success: false,
                    items: [],
                    contentType: ContentType.HTML,
                    error: 'No item selector provided or detected',
                };
            }

            const elements = root.querySelectorAll(selector);
            const items: NewsItem[] = [];

            for (const element of elements) {
                try {
                    const newsItem = this.extractItem(element, sourceId, sourceName, options);
                    if (newsItem) items.push(newsItem);
                } catch (e) {
                    logger.warn(`Skipping malformed HTML item: ${e}`);
                }
            }

            // Extract page metadata
            const title = root.querySelector('title')?.text ||
                root.querySelector('meta[property="og:title"]')?.getAttribute('content');
            const description = root.querySelector('meta[name="description"]')?.getAttribute('content') ||
                root.querySelector('meta[property="og:description"]')?.getAttribute('content');

            return {
                success: true,
                items,
                contentType: ContentType.HTML,
                metadata: {
                    title,
                    description,
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown parse error';
            logger.error(`HTML parse error: ${message}`);
            return {
                success: false,
                items: [],
                contentType: ContentType.HTML,
                error: message,
            };
        }
    }

    /**
     * Try to auto-detect the item selector
     */
    private detectItemSelector(root: HTMLElement): string | null {
        // Common patterns for news/article lists
        const patterns = [
            'article',
            '.article',
            '.post',
            '.news-item',
            '.entry',
            '.item',
            'li.post',
            '.card',
            '[data-article]',
            '.story',
        ];

        for (const pattern of patterns) {
            const items = root.querySelectorAll(pattern);
            if (items.length >= 2) {
                logger.debug(`Auto-detected selector: ${pattern} (${items.length} items)`);
                return pattern;
            }
        }

        return null;
    }

    /**
     * Extract news item from HTML element
     */
    private extractItem(
        element: HTMLElement,
        sourceId: string,
        sourceName: string,
        options?: Record<string, unknown>
    ): NewsItem | null {
        // Try to find link
        const linkEl = element.querySelector('a[href]');
        const link = linkEl?.getAttribute('href') || '';

        // Try to find title
        const titleEl = element.querySelector('h1, h2, h3, h4, .title, [class*="title"]');
        const title = titleEl?.text.trim() || linkEl?.text.trim() || '';

        if (!link && !title) return null;

        // Generate ID
        const id = this.hashString(link || title);

        // Try to find description
        const descEl = element.querySelector('p, .description, .summary, .excerpt, [class*="desc"]');
        const description = descEl?.text.trim();

        // Try to find image
        const imgEl = element.querySelector('img[src]');
        const imageUrl = imgEl?.getAttribute('src');

        // Try to find date
        const timeEl = element.querySelector('time[datetime]');
        const dateStr = timeEl?.getAttribute('datetime') ||
            element.querySelector('.date, .time, [class*="date"]')?.text;
        const publishedAt = dateStr ? new Date(dateStr) : undefined;

        // Try to find author
        const authorEl = element.querySelector('.author, [class*="author"], [rel="author"]');
        const author = authorEl?.text.trim();

        // Try to find categories
        const tagEls = element.querySelectorAll('.tag, .category, [class*="tag"]');
        const categories = tagEls.map(el => el.text.trim()).filter(Boolean);

        return {
            id,
            title: title || 'Untitled',
            link: this.resolveUrl(link, options?.baseUrl as string),
            description,
            author,
            publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : undefined,
            categories,
            sourceId,
            sourceName,
            imageUrl: imageUrl ? this.resolveUrl(imageUrl, options?.baseUrl as string) : undefined,
        };
    }

    /**
     * Resolve relative URLs
     */
    private resolveUrl(url: string, baseUrl?: string): string {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        if (baseUrl) {
            try {
                return new URL(url, baseUrl).href;
            } catch {
                return url;
            }
        }
        return url;
    }

    /**
     * Simple hash for ID generation
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `html-${Math.abs(hash)}`;
    }
}
