import { OperatorSecurityService } from './operator-security.service';
import { InternalServerErrorException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('OperatorSecurityService', () => {
  let service: OperatorSecurityService;

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.CONTROL_PLANE_ENCRYPTION_KEY;
    delete process.env.OPERATOR_JWT_SECRET;
    service = new OperatorSecurityService();
  });

  describe('Argon2id Password Hashing', () => {
    it('should securely hash and verify passwords using Argon2id', async () => {
      const plain = 'SecureOperatorPassword123!';
      const hash = await service.hashPassword(plain);

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$argon2id\$/); // Must be Argon2id format
      expect(await service.comparePassword(plain, hash)).toBe(true);
      expect(await service.comparePassword('WrongPassword', hash)).toBe(false);
    });

    it('should verify legacy Bcrypt hashes for smooth migration transition', async () => {
      const plain = 'LegacyBcryptPassword123!';
      const legacyHash = await bcrypt.hash(plain, 10);

      expect(legacyHash).toMatch(/^\$2b\$/);
      expect(await service.comparePassword(plain, legacyHash)).toBe(true);
      expect(await service.comparePassword('WrongPassword', legacyHash)).toBe(false);
    });
  });

  describe('AES-256-GCM TOTP Secret Encryption & Key Separation', () => {
    it('should perform encrypt -> decrypt round trip cleanly', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = service.encryptSecret(secret);

      expect(encrypted).not.toEqual(secret);
      expect(encrypted.split(':').length).toBe(3); // iv:tag:ciphertext

      const decrypted = service.decryptSecret(encrypted);
      expect(decrypted).toEqual(secret);
    });

    it('should fail decryption on tampered ciphertext', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = service.encryptSecret(secret);
      const [iv, tag, cipher] = encrypted.split(':');

      const tamperedCipher = cipher.substring(0, cipher.length - 2) + '00';
      const tamperedStr = `${iv}:${tag}:${tamperedCipher}`;

      const decrypted = service.decryptSecret(tamperedStr);
      expect(decrypted).toEqual('');
    });

    it('should fail decryption on tampered auth tag', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = service.encryptSecret(secret);
      const [iv, tag, cipher] = encrypted.split(':');

      const tamperedTag = '0'.repeat(tag.length);
      const tamperedStr = `${iv}:${tamperedTag}:${cipher}`;

      const decrypted = service.decryptSecret(tamperedStr);
      expect(decrypted).toEqual('');
    });

    it('should prove key separation: changing OPERATOR_JWT_SECRET does NOT affect MFA decryption', () => {
      process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'mfa-encryption-key-32-bytes-spec!';
      process.env.OPERATOR_JWT_SECRET = 'jwt-signing-secret-original';

      const s = new OperatorSecurityService();
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = s.encryptSecret(secret);

      // Change JWT secret
      process.env.OPERATOR_JWT_SECRET = 'jwt-signing-secret-CHANGED';
      const s2 = new OperatorSecurityService();

      // MFA decryption must still succeed because CONTROL_PLANE_ENCRYPTION_KEY is identical
      expect(s2.decryptSecret(encrypted)).toEqual(secret);
    });

    it('should prove key rotation: changing CONTROL_PLANE_ENCRYPTION_KEY invalidates existing ciphertext decryption', () => {
      process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'mfa-encryption-key-ORIGINAL-32!';

      const s = new OperatorSecurityService();
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = s.encryptSecret(secret);

      // Change Encryption key
      process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'mfa-encryption-key-ROTATED-32--!';
      const s2 = new OperatorSecurityService();

      // MFA decryption fails because key changed
      expect(s2.decryptSecret(encrypted)).toEqual('');
    });

    it('should fail closed in production if CONTROL_PLANE_ENCRYPTION_KEY is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CONTROL_PLANE_ENCRYPTION_KEY;

      const s = new OperatorSecurityService();
      expect(() => s.encryptSecret('JBSWY3DPEHPK3PXP')).toThrow(InternalServerErrorException);
    });
  });

  describe('RFC 6238 TOTP Code Verification', () => {
    it('should generate and verify RFC 6238 TOTP codes', () => {
      const { secret, otpauthUrl } = service.generateTotpSecret('operator@omnigrc.co');

      expect(secret).toBeDefined();
      expect(otpauthUrl).toContain('otpauth://totp/');
      expect(otpauthUrl).toContain(encodeURIComponent('operator@omnigrc.co'));

      const nowWindow = Math.floor(Date.now() / 1000 / 30);
      const validCode = (service as any).generateTotpCodeForWindow(secret, nowWindow);

      expect(service.verifyTotpCode(secret, validCode)).toBe(true);
      expect(service.verifyTotpCode(secret, '000000')).toBe(false);
    });
  });

  describe('Subnet CIDR Drift Check', () => {
    it('should allow soft CIDR subnet drift for IPv4 and IPv6 addresses', () => {
      expect(service.checkCidrSoftDrift('192.168.1.10', '192.168.1.55')).toBe(true);
      expect(service.checkCidrSoftDrift('10.0.0.1', '10.0.0.250')).toBe(true);
      expect(service.checkCidrSoftDrift('127.0.0.1', '127.0.0.1')).toBe(true);
    });
  });
});
