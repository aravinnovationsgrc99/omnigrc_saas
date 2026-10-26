import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as dns from 'dns';
import * as net from 'net';
import { URL } from 'url';

export interface SafeFetchOptions {
  allowedDomains: string[];
  maxRedirects?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
  acceptedContentTypes?: string[];
  headers?: Record<string, string>;
  allowInsecureHttpForTesting?: boolean;
}

export interface SafeFetchResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  contentType: string;
  finalUrl: string;
}

export class SsrfSecurityException extends ForbiddenException {
  constructor(message: string) {
    super(`SSRF Security Violation: ${message}`);
  }
}

/**
 * Validates whether an IPv4 address is in a private, loopback, link-local, multicast, or reserved CIDR.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is treated as unsafe
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local, including AWS/GCP metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network: 172.16.0.0 – 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved for Future Use: 240.0.0.0 - 255.255.255.254)
  if (a >= 240) return true;

  return false;
}

/**
 * Validates whether an IPv6 address is loopback, unique local, link-local, multicast, or IPv4-mapped.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback ::1
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // Unspecified ::
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 ::ffff:a.b.c.d
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.substring(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateOrReservedIPv4(ipv4Part);
    }
  }

  // fc00::/7 (Unique local address / private)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // fe80::/10 (Link-local unicast)
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  // ff00::/8 (Multicast)
  if (normalized.startsWith('ff')) return true;

  // 2001:db8::/32 (Documentation)
  if (normalized.startsWith('2001:db8:')) return true;

  return false;
}

/**
 * Checks if an IP (v4 or v6) is private or reserved.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateOrReservedIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateOrReservedIPv6(ip);
  }
  return true; // Unknown IP formats are treated as unsafe
}

/**
 * Validates whether a hostname belongs to an allowed domain (exact match or proper subdomain).
 */
export function isHostnameAllowed(hostname: string, allowedDomains: string[]): boolean {
  if (!hostname || !allowedDomains || allowedDomains.length === 0) {
    return false;
  }

  const cleanHost = hostname.toLowerCase().trim();

  for (const allowed of allowedDomains) {
    const cleanAllowed = allowed.toLowerCase().trim();
    if (cleanHost === cleanAllowed) {
      return true;
    }
    // Proper subdomain: e.g. "www.rbi.org.in" ends with ".rbi.org.in"
    if (cleanHost.endsWith(`.${cleanAllowed}`)) {
      return true;
    }
  }

  return false;
}

@Injectable()
export class SsrfSafeHttpClientService {
  private readonly logger = new Logger(SsrfSafeHttpClientService.name);

  private readonly DEFAULT_TIMEOUT_MS = 15000;
  private readonly DEFAULT_MAX_REDIRECTS = 3;
  private readonly DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  /**
   * Resolves DNS for the given hostname and verifies that NO resolved IP is private or reserved.
   */
  public async resolveAndValidateIp(hostname: string): Promise<string> {
    // If hostname is directly an IP literal:
    if (net.isIP(hostname)) {
      if (isPrivateOrReservedIp(hostname)) {
        throw new SsrfSecurityException(`Direct IP connection to private/reserved address "${hostname}" is blocked.`);
      }
      return hostname;
    }

    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        throw new BadRequestException(`Unable to resolve host "${hostname}".`);
      }

      for (const record of addresses) {
        if (isPrivateOrReservedIp(record.address)) {
          this.logger.warn(`SSRF Block: Resolved IP "${record.address}" for host "${hostname}" is private/reserved.`);
          throw new SsrfSecurityException(
            `Destination host "${hostname}" resolved to prohibited IP address "${record.address}".`,
          );
        }
      }

      // Return the first validated IP address
      return addresses[0].address;
    } catch (err: any) {
      if (err instanceof SsrfSecurityException || err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(`DNS resolution error for host "${hostname}": ${err.message}`);
    }
  }

  /**
   * Validates URL scheme, credentials, and allowed domain.
   */
  public validateUrl(urlStr: string, allowedDomains: string[], allowInsecureHttp: boolean = false): URL {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new BadRequestException(`Malformed URL provided: "${urlStr}".`);
    }

    // Scheme check: enforce HTTPS by default
    if (parsed.protocol !== 'https:') {
      if (parsed.protocol === 'http:' && allowInsecureHttp) {
        // Allowed only in isolated test fixtures
      } else {
        throw new SsrfSecurityException(`Insecure scheme "${parsed.protocol}" forbidden. HTTPS is required.`);
      }
    }

    // Reject embedded credentials (e.g. https://user:pass@example.com)
    if (parsed.username || parsed.password) {
      throw new SsrfSecurityException('URLs containing embedded user credentials are strictly prohibited.');
    }

    // Hostname allowlist check
    if (!isHostnameAllowed(parsed.hostname, allowedDomains)) {
      this.logger.warn(`SSRF Block: Host "${parsed.hostname}" is not in allowed domains [${allowedDomains.join(', ')}].`);
      throw new SsrfSecurityException(
        `Hostname "${parsed.hostname}" is not authorized. Approved domains for this source are: [${allowedDomains.join(', ')}].`,
      );
    }

    return parsed;
  }

  /**
   * Executes a safe, bounded GET request with multi-hop redirect re-validation and stream bounding.
   */
  public async get(urlStr: string, options: SafeFetchOptions): Promise<SafeFetchResponse> {
    const maxRedirects = options.maxRedirects ?? this.DEFAULT_MAX_REDIRECTS;
    const timeoutMs = options.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    const maxSizeBytes = options.maxSizeBytes ?? this.DEFAULT_MAX_SIZE_BYTES;
    const allowInsecureHttp = !!options.allowInsecureHttpForTesting;

    let currentUrl = urlStr;
    let redirectCount = 0;

    while (redirectCount <= maxRedirects) {
      const parsedUrl = this.validateUrl(currentUrl, options.allowedDomains, allowInsecureHttp);

      // Pre-connection DNS validation
      await this.resolveAndValidateIp(parsedUrl.hostname);

      const response = await this.performSingleRequest(parsedUrl, {
        timeoutMs,
        maxSizeBytes,
        headers: options.headers,
        acceptedContentTypes: options.acceptedContentTypes,
      });

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new BadRequestException(`Exceeded maximum redirect limit of ${maxRedirects}.`);
        }

        const locationHeader = response.headers['location'];
        if (!locationHeader) {
          throw new BadRequestException(`Received redirect status ${response.statusCode} without Location header.`);
        }

        // Resolve redirect URL (supports relative and absolute redirects)
        const nextUrl = new URL(locationHeader, currentUrl).toString();
        this.logger.debug(`Following safe redirect #${redirectCount} to: ${nextUrl}`);

        // Strip sensitive authorization/cookies when redirecting
        if (options.headers) {
          delete options.headers['authorization'];
          delete options.headers['cookie'];
        }

        currentUrl = nextUrl;
        continue;
      }

      // Check status code
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new BadRequestException(
          `Official endpoint responded with HTTP ${response.statusCode}: ${response.body.toString('utf8', 0, 300)}`,
        );
      }

      // Validate content type if requested
      if (options.acceptedContentTypes && options.acceptedContentTypes.length > 0) {
        const contentTypeHeader = (response.headers['content-type'] || '').toLowerCase();
        const matchesAccepted = options.acceptedContentTypes.some((accepted) =>
          contentTypeHeader.includes(accepted.toLowerCase()),
        );

        if (!matchesAccepted) {
          throw new BadRequestException(
            `Unsupported Content-Type "${contentTypeHeader}". Expected one of: [${options.acceptedContentTypes.join(', ')}].`,
          );
        }
      }

      return {
        ...response,
        finalUrl: currentUrl,
      };
    }

    throw new BadRequestException(`Exceeded maximum redirect limit of ${maxRedirects}.`);
  }

  /**
   * Performs a single HTTP/HTTPS GET request with timeout and byte size bounding.
   */
  private performSingleRequest(
    url: URL,
    config: {
      timeoutMs: number;
      maxSizeBytes: number;
      headers?: Record<string, string>;
      acceptedContentTypes?: string[];
    },
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer; contentType: string }> {
    return new Promise((resolve, reject) => {
      const isHttps = url.protocol === 'https:';
      const transport: any = isHttps ? https : http;

      const requestHeaders: Record<string, string> = {
        'User-Agent': 'OMNiGRC-RegulatoryIntelligence-Bot/1.0 (+https://omnigrc.co/bot)',
        Accept: config.acceptedContentTypes?.join(', ') || '*/*',
        ...(config.headers || {}),
      };

      const req = transport.request(
        url,
        {
          method: 'GET',
          headers: requestHeaders,
          timeout: config.timeoutMs,
        },
        (res: http.IncomingMessage) => {
          const statusCode = res.statusCode || 500;
          const headers = res.headers;
          const contentType = (headers['content-type'] as string) || '';

          // If redirect, we don't consume the full body
          if ([301, 302, 303, 307, 308].includes(statusCode)) {
            res.resume(); // Discard stream
            return resolve({
              statusCode,
              headers,
              body: Buffer.alloc(0),
              contentType,
            });
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;

          res.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > config.maxSizeBytes) {
              res.destroy();
              return reject(
                new BadRequestException(
                  `Response payload exceeded maximum allowed size of ${(config.maxSizeBytes / 1024 / 1024).toFixed(2)} MB.`,
                ),
              );
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            const body = Buffer.concat(chunks);
            resolve({
              statusCode,
              headers,
              body,
              contentType,
            });
          });

          res.on('error', (streamErr) => {
            reject(new BadRequestException(`Network stream error: ${streamErr.message}`));
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new BadRequestException(`Connection to official host timed out after ${config.timeoutMs}ms.`));
      });

      req.on('error', (reqErr: any) => {
        reject(new BadRequestException(`Request failed to ${url.hostname}: ${reqErr.message}`));
      });

      req.end();
    });
  }
}
