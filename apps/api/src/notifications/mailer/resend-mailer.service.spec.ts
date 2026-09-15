import { ResendMailerService, SendEmailParams } from './resend-mailer.service';
import { PriorityLevel } from '../templates/email-templates';

describe('ResendMailerService', () => {
  let service: ResendMailerService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    delete process.env.RESEND_API_KEY;
    service = new ResendMailerService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Mock Mode (when RESEND_API_KEY is absent)', () => {
    it('should return true for single email send in mock mode', async () => {
      const res = await service.sendEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });
      expect(res).toBe(true);
    });

    it('should return allSuccessful = true for batch email send in mock mode', async () => {
      const emails: SendEmailParams[] = [
        { to: 'user1@example.com', subject: 'S1', html: '<p>H1</p>' },
        { to: 'user2@example.com', subject: 'S2', html: '<p>H2</p>' },
      ];
      const res = await service.sendBatchEmail(emails, PriorityLevel.P3);
      expect(res.allSuccessful).toBe(true);
      expect(res.successfulTos).toEqual(['user1@example.com', 'user2@example.com']);
      expect(res.failedTos).toEqual([]);
      expect(res.results.length).toBe(2);
    });
  });

  describe('Live Mode with RESEND_API_KEY configured', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 're_test_key_123';
      service = new ResendMailerService();
    });

    it('should handle all recipients succeeding in batch send', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'msg_1' },
            { id: 'msg_2' },
          ],
        }),
      } as Response);

      const emails: SendEmailParams[] = [
        { to: 'alice@example.com', subject: 'Sub1', html: '<p>Hi</p>' },
        { to: 'bob@example.com', subject: 'Sub2', html: '<p>Hi</p>' },
      ];

      const res = await service.sendBatchEmail(emails, PriorityLevel.P3);
      expect(res.allSuccessful).toBe(true);
      expect(res.successfulTos).toEqual(['alice@example.com', 'bob@example.com']);
      expect(res.failedTos).toEqual([]);
    });

    it('should correctly process partial batch failures (1 success, 1 failure inside 200 OK)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'msg_1' },
            { error: { message: 'Domain unverified', name: 'validation_error' } },
          ],
        }),
      } as Response);

      const emails: SendEmailParams[] = [
        { to: 'success@example.com', subject: 'Sub1', html: '<p>Hi</p>' },
        { to: 'fail@example.com', subject: 'Sub2', html: '<p>Hi</p>' },
      ];

      const res = await service.sendBatchEmail(emails, PriorityLevel.P3);
      expect(res.allSuccessful).toBe(false);
      expect(res.successfulTos).toEqual(['success@example.com']);
      expect(res.failedTos).toEqual(['fail@example.com']);
      expect(res.results[1].error).toBe('Domain unverified');
    });

    it('should handle complete batch failure when HTTP status is not ok (e.g. 500 server error)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      const emails: SendEmailParams[] = [
        { to: 'user1@example.com', subject: 'Sub1', html: '<p>Hi</p>' },
        { to: 'user2@example.com', subject: 'Sub2', html: '<p>Hi</p>' },
      ];

      const res = await service.sendBatchEmail(emails, PriorityLevel.P3);
      expect(res.allSuccessful).toBe(false);
      expect(res.successfulTos).toEqual([]);
      expect(res.failedTos).toEqual(['user1@example.com', 'user2@example.com']);
    });

    it('should correctly chunk batch requests when payload exceeds 100 recipients', async () => {
      // Create 150 recipients
      const emails: SendEmailParams[] = Array.from({ length: 150 }, (_, i) => ({
        to: `user${i}@example.com`,
        subject: `Subject ${i}`,
        html: `<p>Content ${i}</p>`,
      }));

      const mockFetch = jest.fn().mockImplementation(async (_, options) => {
        const body = JSON.parse(options.body);
        const count = body.length;
        return {
          ok: true,
          json: async () => ({
            data: Array.from({ length: count }, (__, idx) => ({ id: `msg_chunk_${idx}` })),
          }),
        };
      });

      global.fetch = mockFetch;

      const res = await service.sendBatchEmail(emails, PriorityLevel.P3);
      expect(mockFetch).toHaveBeenCalledTimes(2); // 100 in 1st chunk, 50 in 2nd chunk
      expect(res.allSuccessful).toBe(true);
      expect(res.successfulTos.length).toBe(150);
    });
  });
});
