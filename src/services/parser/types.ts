import { z } from 'zod';

/**
 * Standardized news item format
 * All parsers convert their source format to this structure
 */
export const NewsItemSchema = z.object({
    /** Unique identifier (derived from URL or content hash) */
    id: z.string(),
    /** Article title */
    title: z.string(),
    /** Article URL */
    link: z.string().url(),
    /** Short description or excerpt */
    description: z.string().optional(),
    /** Full content (if available) */
    content: z.string().optional(),
    /** Author name */
    author: z.string().optional(),
    /** Publication date */
    publishedAt: z.date().optional(),
    /** Categories/tags */
    categories: z.array(z.string()).default([]),
    /** Source identifier */
    sourceId: z.string(),
    /** Source name */
    sourceName: z.string(),
    /** Thumbnail/image URL */
    imageUrl: z.string().url().optional(),
    /** Additional metadata */
    metadata: z.record(z.unknown()).optional(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

/**
 * Detected content types
 */
export enum ContentType {
    RSS = 'rss',
    ATOM = 'atom',
    JSON = 'json',
    HTML = 'html',
    UNKNOWN = 'unknown',
}

/**
 * Parser result
 */
export interface ParseResult {
    success: boolean;
    items: NewsItem[];
    contentType: ContentType;
    error?: string;
    metadata?: {
        title?: string;
        description?: string;
        link?: string;
        lastBuildDate?: Date;
    };
}

/**
 * Adapter interface - all format adapters must implement this
 */
export interface ContentAdapter {
    /** Content types this adapter handles */
    readonly supportedTypes: ContentType[];

    /** Check if this adapter can parse the content */
    canParse(content: string, contentType?: string): boolean;

    /** Parse content to NewsItems */
    parse(
        content: string,
        sourceId: string,
        sourceName: string,
        options?: Record<string, unknown>
    ): Promise<ParseResult>;
}
