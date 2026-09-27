import { RedactionService } from './redaction.service';

describe('RedactionService', () => {
  let service: RedactionService;

  beforeEach(() => {
    service = new RedactionService();
  });

  it('should redact sensitive keys from nested metadata objects', () => {
    const input = {
      action: 'LOGIN',
      user: {
        id: 'user_123',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
      apiKey: 'sk_live_1234567890',
      safeField: 'Public Value',
    };

    const redacted = service.redact(input);

    expect(redacted.safeField).toEqual('Public Value');
    expect(redacted.user.id).toEqual('user_123');
    expect(redacted.user.password).toEqual('[REDACTED]');
    expect(redacted.user.token).toEqual('[REDACTED]');
    expect(redacted.apiKey).toEqual('[REDACTED]');
  });

  it('should redact raw bearer token strings', () => {
    const rawToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
    const redacted = service.redact(rawToken);

    expect(redacted).toEqual('[REDACTED_TOKEN]');
  });
});
