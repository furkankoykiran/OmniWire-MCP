import { describe, it, expect } from 'vitest';
import { UniversalParser } from './index.js';


describe('UniversalParser', () => {
    const parser = new UniversalParser();

    const mockSource: any = { id: 'test', type: 'auto', url: 'http://test.com', name: 'Test Feed', priority: 1, enabled: true };

    it('should parse valid RSS XML', async () => {
        const xml = `
            <rss version="2.0">
                <channel>
                    <title>Test Feed</title>
                    <item>
                        <title>Test Item</title>
                        <link>http://example.com/item</link>
                        <pubDate>Mon, 06 Sep 2021 16:45:00 +0000</pubDate>
                        <description>Test Description</description>
                    </item>
                </channel>
            </rss>
        `;
        const result = await parser.parse(xml, mockSource);
        expect(result.success).toBe(true);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Test Item');
        expect(result.items[0].sourceName).toBe('Test Feed');
    });

    it('should parse valid Atom XML', async () => {
        const xml = `
            <feed xmlns="http://www.w3.org/2005/Atom">
                <title>Test Atom Feed</title>
                <entry>
                    <title>Atom Entry</title>
                    <link href="http://example.com/atom-entry"/>
                    <id>urn:uuid:1234</id>
                    <updated>2021-09-06T16:45:00Z</updated>
                    <summary>Atom Summary</summary>
                </entry>
            </feed>
        `;
        const result = await parser.parse(xml, mockSource);
        expect(result.success).toBe(true);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Atom Entry');
    });

    it('should return empty array for invalid XML', async () => {
        const xml = `<invalid>xml</invalid>`;
        const result = await parser.parse(xml, mockSource);
        expect(result.success).toBe(false);
        expect(result.items).toHaveLength(0);
    });
});
