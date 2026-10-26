import {
  SsrfSafeHttpClientService,
  SsrfSecurityException,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  isHostnameAllowed,
} from './ssrf-safe-http-client.service';
import { BadRequestException } from '@nestjs/common';
import * as http from 'http';

describe('SsrfSafeHttpClientService (Multi-Layer SSRF Defenses)', () => {
  let service: SsrfSafeHttpClientService;

  beforeEach(() => {
    service = new SsrfSafeHttpClientService();
  });

  describe('1. Private and Reserved IP Range Enforcement', () => {
    it('should identify private IPv4 ranges (RFC 1918)', () => {
      expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('10.255.255.255')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.254.254')).toBe(true);
    });

    it('should identify loopback, link-local, and cloud metadata IPv4 addresses', () => {
      expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('127.0.0.2')).toBe(true);
      expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true); // AWS / GCP metadata
      expect(isPrivateOrReservedIPv4('169.254.1.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateOrReservedIPv4('255.255.255.255')).toBe(true);
    });

    it('should identify carrier-grade NAT, test-nets, and multicast addresses', () => {
      expect(isPrivateOrReservedIPv4('100.64.0.1')).toBe(true); // CGNAT
      expect(isPrivateOrReservedIPv4('192.0.2.1')).toBe(true); // TEST-NET-1
      expect(isPrivateOrReservedIPv4('198.51.100.1')).toBe(true); // TEST-NET-2
      expect(isPrivateOrReservedIPv4('203.0.113.1')).toBe(true); // TEST-NET-3
      expect(isPrivateOrReservedIPv4('224.0.0.1')).toBe(true); // Multicast
      expect(isPrivateOrReservedIPv4('240.0.0.1')).toBe(true); // Reserved
    });

    it('should allow public routable IPv4 addresses', () => {
      expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIPv4('104.26.10.78')).toBe(false);
    });

    it('should identify private, loopback, and unique-local IPv6 addresses', () => {
      expect(isPrivateOrReservedIPv6('::1')).toBe(true); // Loopback
      expect(isPrivateOrReservedIPv6('::')).toBe(true); // Unspecified
      expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true); // Unique local
      expect(isPrivateOrReservedIPv6('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true); // Link-local
      expect(isPrivateOrReservedIPv6('ff02::1')).toBe(true); // Multicast
      expect(isPrivateOrReservedIPv6('::ffff:127.0.0.1')).toBe(true); // IPv4-mapped loopback
      expect(isPrivateOrReservedIPv6('::ffff:10.0.0.1')).toBe(true); // IPv4-mapped private
    });

    it('should allow public routable IPv6 addresses', () => {
      expect(isPrivateOrReservedIPv6('2606:4700:4700::1111')).toBe(false);
      expect(isPrivateOrReservedIPv6('2001:4860:4860::8888')).toBe(false);
    });
  });

  describe('2. Hostname and Domain Allowlisting', () => {
    const allowed = ['rbi.org.in', 'www.rbi.org.in'];

    it('should allow exact match domain', () => {
      expect(isHostnameAllowed('rbi.org.in', allowed)).toBe(true);
      expect(isHostnameAllowed('www.rbi.org.in', allowed)).toBe(true);
    });

    it('should allow proper subdomains of allowed domain', () => {
      expect(isHostnameAllowed('api.rbi.org.in', allowed)).toBe(true);
      expect(isHostnameAllowed('notifications.rbi.org.in', allowed)).toBe(true);
    });

    it('should reject unapproved domains and subdomain spoofing attempts', () => {
      expect(isHostnameAllowed('evil.com', allowed)).toBe(false);
      expect(isHostnameAllowed('rbi.org.in.evil.com', allowed)).toBe(false);
      expect(isHostnameAllowed('notrbi.org.in', allowed)).toBe(false);
      expect(isHostnameAllowed('rbi.org.in.attacker.net', allowed)).toBe(false);
    });
  });

  describe('3. URL Validation & Scheme Enforcement', () => {
    const allowed = ['rbi.org.in', 'www.rbi.org.in'];

    it('should accept valid HTTPS URL targeting allowed domain', () => {
      const url = service.validateUrl('https://www.rbi.org.in/notifications_rss.xml', allowed);
      expect(url.hostname).toBe('www.rbi.org.in');
      expect(url.protocol).toBe('https:');
    });

    it('should strictly reject insecure HTTP by default', () => {
      expect(() => {
        service.validateUrl('http://www.rbi.org.in/notifications_rss.xml', allowed);
      }).toThrow(SsrfSecurityException);
    });

    it('should reject non-HTTP schemes (file://, ftp://, gopher://, javascript:)', () => {
      expect(() => service.validateUrl('file:///etc/passwd', allowed)).toThrow();
      expect(() => service.validateUrl('ftp://rbi.org.in/file', allowed)).toThrow();
      expect(() => service.validateUrl('javascript:alert(1)', allowed)).toThrow();
    });

    it('should reject URLs with embedded user credentials', () => {
      expect(() => {
        service.validateUrl('https://admin:secret@www.rbi.org.in/feed', allowed);
      }).toThrow(SsrfSecurityException);
    });

    it('should reject URLs targeting non-allowlisted domains', () => {
      expect(() => {
        service.validateUrl('https://attacker.com/malicious_feed.xml', allowed);
      }).toThrow(SsrfSecurityException);
    });

    it('should reject malformed URLs', () => {
      expect(() => service.validateUrl('not a url', allowed)).toThrow(BadRequestException);
    });
  });

  describe('4. Mock HTTP Server: Bounded Fetching, Redirects & Size Limits', () => {
    let mockServer: http.Server;
    let mockPort: number;

    beforeAll((done) => {
      mockServer = http.createServer((req, res) => {
        const url = req.url || '';

        if (url === '/valid-feed.xml') {
          res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
          res.end('<rss><channel><title>Test Feed</title></channel></rss>');
        } else if (url === '/redirect-safe') {
          res.writeHead(302, { Location: '/valid-feed.xml' });
          res.end();
        } else if (url === '/redirect-external-evil') {
          res.writeHead(302, { Location: 'https://evil.com/leak' });
          res.end();
        } else if (url === '/redirect-loop') {
          res.writeHead(302, { Location: '/redirect-loop' });
          res.end();
        } else if (url === '/oversized') {
          res.writeHead(200, { 'Content-Type': 'application/xml' });
          // Send 2KB of data
          res.end(Buffer.alloc(2048, 'X'));
        } else if (url === '/unsupported-content-type') {
          res.writeHead(200, { 'Content-Type': 'application/x-executable' });
          res.end('ELF binary');
        } else if (url === '/error-500') {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockPort = addr.port;
        done();
      });
    });

    afterAll((done) => {
      if (typeof (mockServer as any).closeAllConnections === 'function') {
        (mockServer as any).closeAllConnections();
      }
      mockServer.close(done);
    });

    it('should successfully fetch allowed mock endpoint with allowInsecureHttpForTesting', async () => {
      // Mock resolveAndValidateIp to bypass local loopback check during unit testing
      jest.spyOn(service, 'resolveAndValidateIp').mockResolvedValue('127.0.0.1');

      const res = await service.get(`http://127.0.0.1:${mockPort}/valid-feed.xml`, {
        allowedDomains: ['127.0.0.1'],
        allowInsecureHttpForTesting: true,
        acceptedContentTypes: ['xml'],
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.toString('utf8')).toContain('<rss><channel><title>Test Feed</title></channel></rss>');
      expect(res.finalUrl).toBe(`http://127.0.0.1:${mockPort}/valid-feed.xml`);
    });

    it('should follow safe relative redirect and update finalUrl', async () => {
      jest.spyOn(service, 'resolveAndValidateIp').mockResolvedValue('127.0.0.1');

      const res = await service.get(`http://127.0.0.1:${mockPort}/redirect-safe`, {
        allowedDomains: ['127.0.0.1'],
        allowInsecureHttpForTesting: true,
        acceptedContentTypes: ['xml'],
      });

      expect(res.statusCode).toBe(200);
      expect(res.finalUrl).toBe(`http://127.0.0.1:${mockPort}/valid-feed.xml`);
    });

    it('should strictly reject redirect attempting to hop to a non-allowlisted host', async () => {
      jest.spyOn(service, 'resolveAndValidateIp').mockResolvedValue('127.0.0.1');

      await expect(
        service.get(`http://127.0.0.1:${mockPort}/redirect-external-evil`, {
          allowedDomains: ['127.0.0.1'],
          allowInsecureHttpForTesting: true,
        }),
      ).rejects.toThrow(SsrfSecurityException);
    });

    it('should enforce maximum redirect count and reject infinite redirect loops', async () => {
      jest.spyOn(service, 'resolveAndValidateIp').mockResolvedValue('127.0.0.1');

      await expect(
        service.get(`http://127.0.0.1:${mockPort}/redirect-loop`, {
          allowedDomains: ['127.0.0.1'],
          allowInsecureHttpForTesting: true,
          maxRedirects: 2,
        }),
      ).rejects.toThrow(/Exceeded maximum redirect limit/);
    });

    it('should abort and reject response exceeding maxSizeBytes', async () => {
      jest.spyOn(service, 'resolveAndValidateIp').mockResolvedValue('127.0.0.1');

      await expect(
        service.get(`http://127.0.0.1:${mockPort}/oversized`, {
          allowedDomains: ['127.0.0.1'],
          allowInsecureHttpForTesting: true,
          maxSizeBytes: 1024, // 1KB limit, response is 2KB
        }),
      ).rejects.toThrow(/Response payload exceeded maximum allowed size/);
    });

    it('should reject response with unsupported content type', async () => {
      jest.spyOn(service, 'resolveAndValidateIp').mockResolvedValue('127.0.0.1');

      await expect(
        service.get(`http://127.0.0.1:${mockPort}/unsupported-content-type`, {
          allowedDomains: ['127.0.0.1'],
          allowInsecureHttpForTesting: true,
          acceptedContentTypes: ['xml'],
        }),
      ).rejects.toThrow(/Unsupported Content-Type/);
    });

    it('should handle non-2xx status codes safely', async () => {
      jest.spyOn(service, 'resolveAndValidateIp').mockResolvedValue('127.0.0.1');

      await expect(
        service.get(`http://127.0.0.1:${mockPort}/error-500`, {
          allowedDomains: ['127.0.0.1'],
          allowInsecureHttpForTesting: true,
        }),
      ).rejects.toThrow(/HTTP 500/);
    });
  });
});
