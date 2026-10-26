import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { RegulatorySource } from '@prisma/client';
import * as crypto from 'crypto';
import { URL } from 'url';
import {
  RegulatorySourceAdapter,
  AdapterFetchResult,
  NormalizedPublicationItem,
} from './regulatory-source-adapter.interface';
import { SsrfSafeHttpClientService } from '../security/ssrf-safe-http-client.service';

@Injectable()
export class RbiSourceAdapter implements RegulatorySourceAdapter {
  readonly regulatorCode = 'RBI';
  private readonly logger = new Logger(RbiSourceAdapter.name);

  // Official allowed domains for Reserve Bank of India
  private readonly ALLOWED_DOMAINS = ['rbi.org.in', 'www.rbi.org.in'];

  constructor(private readonly httpClient: SsrfSafeHttpClientService) {}

  canHandle(source: RegulatorySource): boolean {
    return source.regulatorCode.toUpperCase() === 'RBI';
  }

  async fetchAndNormalize(source: RegulatorySource): Promise<AdapterFetchResult> {
    const startTime = Date.now();
    this.logger.log(`Fetching official RBI regulatory feed from "${source.configuredEndpoint}"...`);

    const response = await this.httpClient.get(source.configuredEndpoint, {
      allowedDomains: this.ALLOWED_DOMAINS,
      acceptedContentTypes: ['xml', 'rss', 'text/xml', 'application/xml'],
      maxSizeBytes: 10 * 1024 * 1024, // 10 MB
      timeoutMs: 20000,
    });

    const durationMs = Date.now() - startTime;
    const rawXml = response.body.toString('utf8');

    const items = this.parseFeedXml(rawXml, source.officialDomain);

    this.logger.log(
      `Successfully fetched and normalized ${items.length} publications from RBI feed in ${durationMs}ms.`,
    );

    return {
      items,
      diagnostics: {
        itemCount: items.length,
        fetchedAt: new Date().toISOString(),
        endpoint: source.configuredEndpoint,
        durationMs,
        rawBytesSize: response.body.length,
        extra: {
          statusCode: response.statusCode,
          contentType: response.contentType,
        },
      },
    };
  }

  /**
   * Deterministically parses the RBI RSS 2.0 XML feed into normalized publications.
   */
  public parseFeedXml(rawXml: string, officialDomain: string): NormalizedPublicationItem[] {
    if (!rawXml || rawXml.trim().length === 0) {
      throw new BadRequestException('Empty response received from RBI feed.');
    }

    // Basic XML sanity check
    if (!rawXml.includes('<rss') && !rawXml.includes('<channel')) {
      throw new BadRequestException('Response is not a valid RSS 2.0 regulatory feed.');
    }

    const itemBlocks: string[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(rawXml)) !== null) {
      itemBlocks.push(match[1]);
    }

    const normalizedItems: NormalizedPublicationItem[] = [];

    for (const block of itemBlocks) {
      try {
        const item = this.normalizeSingleItem(block, officialDomain);
        if (item) {
          normalizedItems.push(item);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to parse individual RBI feed item: ${err.message}`);
      }
    }

    return normalizedItems;
  }

  private normalizeSingleItem(block: string, officialDomain: string): NormalizedPublicationItem | null {
    // 1. Extract Title
    const rawTitle = this.extractTagContent(block, 'title');
    if (!rawTitle) {
      return null; // Skip items without a title
    }
    const cleanTitle = this.stripHtmlAndCdata(rawTitle).trim();

    // 2. Extract Link
    const rawLink = this.extractTagContent(block, 'link');
    if (!rawLink) {
      return null; // Skip items without a canonical link
    }
    const unescapedLink = rawLink.replace(/&amp;/g, '&').trim();
    const canonicalUrl = this.canonicalizeUrl(unescapedLink, officialDomain);

    // 3. Extract External ID from Link query string (e.g. Id=13745)
    let externalId: string | undefined;
    try {
      const parsedUrl = new URL(canonicalUrl);
      const idParam = parsedUrl.searchParams.get('Id') || parsedUrl.searchParams.get('id');
      if (idParam) {
        externalId = idParam.trim();
      }
    } catch {
      // Fallback: externalId undefined
    }

    // 4. Extract Publication Date
    const rawPubDate = this.extractTagContent(block, 'pubDate');
    let publicationDate: Date | undefined;
    if (rawPubDate) {
      const parsedDate = new Date(rawPubDate.trim());
      if (!isNaN(parsedDate.getTime())) {
        publicationDate = parsedDate;
      }
    }

    // 5. Extract Description / CDATA Content
    const rawDescription = this.extractTagContent(block, 'description') || '';
    const cleanDescription = this.stripCdata(rawDescription).trim();

    // 6. Extract Circular / Publication Number from description or title
    const publicationNumber = this.extractCircularNumber(cleanDescription, cleanTitle);

    // 7. Extract document URLs if present in description
    const documentUrls = this.extractDocumentUrls(cleanDescription);

    // 8. Compute stable content hash (SHA-256 over clean title + description + link)
    const hashPayload = `${cleanTitle}|${canonicalUrl}|${cleanDescription}`;
    const contentHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

    return {
      externalId,
      canonicalUrl,
      title: cleanTitle,
      publicationNumber,
      publicationDate,
      summary: cleanDescription.substring(0, 500),
      rawContent: cleanDescription,
      contentHash,
      documentUrls,
      rawMetadata: {
        rawPubDate,
        extractedExternalId: externalId,
        circularNumberFound: !!publicationNumber,
      },
    };
  }

  private extractTagContent(block: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = regex.exec(block);
    return match ? match[1] : null;
  }

  private stripCdata(str: string): string {
    return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  }

  private stripHtmlAndCdata(str: string): string {
    const noCdata = this.stripCdata(str);
    return noCdata.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  }

  private canonicalizeUrl(rawUrl: string, officialDomain: string): string {
    try {
      const url = new URL(rawUrl);
      // Canonicalize protocol to https
      url.protocol = 'https:';
      // Lowercase hostname
      url.hostname = url.hostname.toLowerCase();
      // Remove trailing slash if root path only, or keep clean
      return url.toString();
    } catch {
      // If relative URL, prepend official domain
      if (rawUrl.startsWith('/')) {
        return `https://${officialDomain}${rawUrl}`;
      }
      return rawUrl;
    }
  }

  private extractCircularNumber(description: string, title: string): string | undefined {
    // Patterns observed in RBI circulars:
    // e.g. RBI/FED/2026-27/298
    // e.g. RBI/2026-27/299
    // e.g. DOR.ORG.REC.22/21.06.050/2026-27
    // e.g. A.P. (DIR Series) Circular. No 28/2026-27
    const rbiPattern = /\b(RBI\/(?:[A-Z]+\/)?\d{4}-\d{2,4}\/\d+)\b/i;
    const rbiMatch = rbiPattern.exec(description) || rbiPattern.exec(title);
    if (rbiMatch) {
      return rbiMatch[1].trim();
    }

    const apDirPattern = /(A\.P\.\s*\(DIR\s*Series\)\s*Circular[\s\.]*No[\s\.]*[\w\/-]+)/i;
    const apMatch = apDirPattern.exec(description) || apDirPattern.exec(title);
    if (apMatch) {
      return apMatch[1].trim();
    }

    const dorPattern = /\b((?:DOR|DoR)\.[A-Z0-9\.\/-]+)/;
    const dorMatch = dorPattern.exec(description) || dorPattern.exec(title);
    if (dorMatch) {
      return dorMatch[1].trim();
    }

    return undefined;
  }

  private extractDocumentUrls(htmlContent: string): string[] {
    const urls: string[] = [];
    const hrefRegex = /href=["']([^"']+\.(?:pdf|docx|xlsx))["']/gi;
    let match: RegExpExecArray | null;

    while ((match = hrefRegex.exec(htmlContent)) !== null) {
      urls.push(match[1]);
    }

    return urls;
  }
}
