import { Injectable } from '@nestjs/common';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'creditcard',
  'ssn',
  'totpsecret',
  'refreshtoken',
  'refreshtokenhash',
  'registrationsecrethash',
  'privatekey',
  'signingkey',
]);

@Injectable()
export class RedactionService {
  /**
   * Recursively redacts sensitive keys from an object or string payload.
   */
  public redact(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.redactString(data);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.redact(item));
    }

    if (typeof data === 'object') {
      const redacted: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey) || this.isKeySensitive(lowerKey)) {
          redacted[key] = '[REDACTED]';
        } else {
          redacted[key] = this.redact(value);
        }
      }
      return redacted;
    }

    return data;
  }

  private isKeySensitive(key: string): boolean {
    return (
      key.includes('password') ||
      key.includes('secret') ||
      key.includes('token') ||
      key.includes('auth') ||
      key.includes('key')
    );
  }

  private redactString(value: string): string {
    // Redact JWT tokens if embedded in raw string
    if (value.startsWith('Bearer ') || (value.split('.').length === 3 && value.length > 50)) {
      return '[REDACTED_TOKEN]';
    }
    return value;
  }
}
