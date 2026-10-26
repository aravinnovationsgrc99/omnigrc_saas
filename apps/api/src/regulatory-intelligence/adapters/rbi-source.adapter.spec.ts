import { RbiSourceAdapter } from './rbi-source.adapter';
import { SsrfSafeHttpClientService } from '../security/ssrf-safe-http-client.service';
import { BadRequestException } from '@nestjs/common';
import { RegulatorySourceType, RegulatoryHealthStatus } from '@prisma/client';

describe('RbiSourceAdapter (Feed Parsing & Normalization)', () => {
  let adapter: RbiSourceAdapter;
  let mockHttpClient: jest.Mocked<SsrfSafeHttpClientService>;

  const mockRbiSource = {
    id: 'src-rbi-1',
    regulatorCode: 'RBI',
    displayName: 'Reserve Bank of India — Official Notifications & Circulars Feed',
    catalogueEntryId: 'cat-rbi-1',
    officialDomain: 'rbi.org.in',
    configuredEndpoint: 'https://www.rbi.org.in/notifications_rss.xml',
    sourceType: RegulatorySourceType.RSS,
    isEnabled: true,
    isPaused: false,
    consecutiveFailures: 0,
    pollingIntervalMinutes: 1440,
    lastAttemptedFetchAt: null,
    lastSuccessfulFetchAt: null,
    nextScheduledFetchAt: null,
    healthStatus: RegulatoryHealthStatus.UNTESTED,
    lastErrorMessage: null,
    sanitizedDiagnostics: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleRbiXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>NOTIFICATIONS FROM RBI</title>
    <link>http://www.rbi.org.in</link>
    <description>This is Feed from RBI for notifications.</description>
    <item>
      <title><![CDATA[Delegation of Compounding of certain Contraventions under FEMA, 1999 to Regional Offices]]></title>
      <link>https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=13745&amp;Mode=0</link>
      <pubDate>Fri, 23 Oct 2026 17:10:00</pubDate>
      <description><![CDATA[<table><tr><td><p>RBI/FED/2026-27/298<br>A.P. (DIR Series) Circular. No 28/2026-27</p><p>Delegation of Compounding...</p></td></tr></table>]]></description>
    </item>
    <item>
      <title><![CDATA[Reserve Bank of India (Commercial Banks – Forthcoming Instructions) Second Amendment Directions, 2026]]></title>
      <link>https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=13744&amp;Mode=0</link>
      <pubDate>Fri, 23 Oct 2026 17:30:00</pubDate>
      <description><![CDATA[<table><tr><td><p>RBI/2026-27/299<br>DOR.ORG.REC.22/21.06.050/2026-27</p><p>Amendment Directions...</p></td></tr></table>]]></description>
    </item>
  </channel>
</rss>`;

  beforeEach(() => {
    mockHttpClient = {
      get: jest.fn(),
      validateUrl: jest.fn(),
      resolveAndValidateIp: jest.fn(),
    } as any;

    adapter = new RbiSourceAdapter(mockHttpClient);
  });

  describe('1. Adapter Matching', () => {
    it('should handle RBI sources', () => {
      expect(adapter.canHandle(mockRbiSource)).toBe(true);
      expect(adapter.canHandle({ ...mockRbiSource, regulatorCode: 'rbi' })).toBe(true);
    });

    it('should reject non-RBI sources', () => {
      expect(adapter.canHandle({ ...mockRbiSource, regulatorCode: 'SEBI' })).toBe(false);
      expect(adapter.canHandle({ ...mockRbiSource, regulatorCode: 'NIST' })).toBe(false);
    });
  });

  describe('2. Feed Parsing & Normalization', () => {
    it('should parse valid RBI RSS feed into normalized publication items', () => {
      const items = adapter.parseFeedXml(sampleRbiXml, 'rbi.org.in');
      expect(items).toHaveLength(2);

      const first = items[0];
      expect(first.title).toBe(
        'Delegation of Compounding of certain Contraventions under FEMA, 1999 to Regional Offices',
      );
      expect(first.externalId).toBe('13745');
      expect(first.canonicalUrl).toBe('https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=13745&Mode=0');
      expect(first.publicationNumber).toBe('RBI/FED/2026-27/298');
      expect(first.publicationDate).toBeInstanceOf(Date);
      expect(first.contentHash).toBeDefined();
      expect(first.contentHash).toHaveLength(64); // SHA-256 hex string
      expect(first.feedContentHash).toBeDefined();
      expect(first.isDocumentBytesVerified).toBe(false);
      expect(first.documentBytesSha256).toBeUndefined();

      const second = items[1];
      expect(second.title).toContain('Reserve Bank of India (Commercial Banks');
      expect(second.externalId).toBe('13744');
      expect(second.publicationNumber).toBe('RBI/2026-27/299');
    });

    it('should keep feedContentHash identical when only title or metadata changes (DATA-01)', () => {
      const xml1 = `<rss version="2.0"><channel><item>
        <title>Original Headline Title</title>
        <link>https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=11111</link>
        <description><![CDATA[Standard substantive notification body text describing capital rules.]]></description>
      </item></channel></rss>`;

      const xml2 = `<rss version="2.0"><channel><item>
        <title>Corrected Headline Title with Typo Fixed</title>
        <link>https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=11111</link>
        <description><![CDATA[Standard substantive notification body text describing capital rules.]]></description>
      </item></channel></rss>`;

      const items1 = adapter.parseFeedXml(xml1, 'rbi.org.in');
      const items2 = adapter.parseFeedXml(xml2, 'rbi.org.in');

      expect(items1[0].title).not.toEqual(items2[0].title);
      expect(items1[0].feedContentHash).toEqual(items2[0].feedContentHash);
      expect(items1[0].isDocumentBytesVerified).toBe(false);
      expect(items2[0].isDocumentBytesVerified).toBe(false);
    });

    it('should extract publicationNumber from alternate DOR format when present', () => {
      const xml = `<rss version="2.0"><channel><item>
        <title>Prudential Regulations Update</title>
        <link>https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=99999</link>
        <description><![CDATA[DOR.CAP.REC.251/21-02-002/2026-27 update]]></description>
      </item></channel></rss>`;

      const items = adapter.parseFeedXml(xml, 'rbi.org.in');
      expect(items).toHaveLength(1);
      expect(items[0].publicationNumber).toBe('DOR.CAP.REC.251/21-02-002/2026-27');
    });

    it('should handle missing optional fields gracefully', () => {
      const xmlWithMissingFields = `<rss version="2.0"><channel><item>
        <title>Notice without date or circular number</title>
        <link>https://www.rbi.org.in/scripts/BS_ViewMasDirections.aspx</link>
        <description>Simple plain text description</description>
      </item></channel></rss>`;

      const items = adapter.parseFeedXml(xmlWithMissingFields, 'rbi.org.in');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Notice without date or circular number');
      expect(items[0].publicationDate).toBeUndefined();
      expect(items[0].publicationNumber).toBeUndefined();
      expect(items[0].externalId).toBeUndefined();
      expect(items[0].canonicalUrl).toBe('https://www.rbi.org.in/scripts/BS_ViewMasDirections.aspx');
    });

    it('should handle malformed dates without throwing exceptions', () => {
      const xmlWithBadDate = `<rss version="2.0"><channel><item>
        <title>Bad Date Item</title>
        <link>https://www.rbi.org.in/item/1</link>
        <pubDate>Not a valid date string</pubDate>
      </item></channel></rss>`;

      const items = adapter.parseFeedXml(xmlWithBadDate, 'rbi.org.in');
      expect(items).toHaveLength(1);
      expect(items[0].publicationDate).toBeUndefined();
    });

    it('should reject empty or whitespace-only feeds', () => {
      expect(() => adapter.parseFeedXml('', 'rbi.org.in')).toThrow(BadRequestException);
      expect(() => adapter.parseFeedXml('   ', 'rbi.org.in')).toThrow(BadRequestException);
    });

    it('should reject non-RSS responses (e.g. HTML 404 or JSON)', () => {
      expect(() => adapter.parseFeedXml('<html><body>404 Not Found</body></html>', 'rbi.org.in')).toThrow(
        /not a valid RSS 2.0/,
      );
    });

    it('should skip items that lack a title or link', () => {
      const xml = `<rss version="2.0"><channel>
        <item><description>No title or link</description></item>
        <item><title>Valid Item</title><link>https://www.rbi.org.in/valid</link></item>
      </channel></rss>`;

      const items = adapter.parseFeedXml(xml, 'rbi.org.in');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Valid Item');
    });
  });

  describe('3. End-to-End Adapter fetchAndNormalize', () => {
    it('should invoke httpClient with verified official domains and return normalized items with diagnostics', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
        body: Buffer.from(sampleRbiXml, 'utf8'),
        contentType: 'application/xml',
        finalUrl: mockRbiSource.configuredEndpoint,
      });

      const result = await adapter.fetchAndNormalize(mockRbiSource);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        mockRbiSource.configuredEndpoint,
        expect.objectContaining({
          allowedDomains: ['rbi.org.in', 'www.rbi.org.in'],
          acceptedContentTypes: ['xml', 'rss', 'text/xml', 'application/xml'],
        }),
      );

      expect(result.items).toHaveLength(2);
      expect(result.diagnostics.itemCount).toBe(2);
      expect(result.diagnostics.endpoint).toBe(mockRbiSource.configuredEndpoint);
      expect(result.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.rawBytesSize).toBe(Buffer.byteLength(sampleRbiXml));
    });
  });
});
