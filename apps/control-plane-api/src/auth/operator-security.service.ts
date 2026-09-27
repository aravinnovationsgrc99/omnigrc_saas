import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DEV_ENCRYPTION_KEY = 'arav-cp-dev-encryption-key-2026-32bytes!'; // 32 bytes fallback for dev

@Injectable()
export class OperatorSecurityService {
  private readonly logger = new Logger(OperatorSecurityService.name);

  /**
   * Hashes operator password using Argon2id with recommended memory and time cost parameters.
   */
  public async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verifies plain password against Argon2id hash.
   */
  public async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      // Fallback for existing bcrypt hashes if any exist during migration transition
      if (hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
        const bcrypt = require('bcrypt');
        return bcrypt.compare(password, hash);
      }
      return await argon2.verify(hash, password);
    } catch (err: any) {
      this.logger.error(`Password verification error: ${err.message}`);
      return false;
    }
  }

  /**
   * Hashes a refresh token using SHA-256 for secure server-side storage.
   */
  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Encrypts sensitive text (e.g. TOTP secret) at rest using AES-256-GCM.
   */
  public encryptSecret(plaintext: string): string {
    if (!plaintext) return plaintext;
    // Idempotency: if already encrypted (iv:authTag:ciphertext format), do not re-encrypt
    if (plaintext.includes(':') && plaintext.split(':').length === 3) {
      return plaintext;
    }

    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts sensitive text (e.g. TOTP secret) encrypted with AES-256-GCM.
   */
  public decryptSecret(ciphertext: string): string {
    if (!ciphertext || !ciphertext.includes(':')) {
      return ciphertext; // Plaintext fallback for legacy
    }

    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) return ciphertext;

      const [ivHex, authTagHex, encryptedHex] = parts;
      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err: any) {
      this.logger.error(`Decryption failure: ${err.message}`);
      return '';
    }
  }

  /**
   * Generates a random Base32 encoded TOTP secret for multi-factor authentication (RFC 6238).
   */
  public generateTotpSecret(email: string): { secret: string; otpauthUrl: string } {
    const buffer = crypto.randomBytes(20);
    const secret = this.base32Encode(buffer);
    const issuer = encodeURIComponent('OMNiGRC Control Plane');
    const label = encodeURIComponent(email);
    const otpauthUrl = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    return { secret, otpauthUrl };
  }

  /**
   * Verifies a 6-digit TOTP code against a Base32 TOTP secret with a ±1 time step tolerance window (RFC 6238).
   */
  public verifyTotpCode(secret: string, code: string): boolean {
    if (!secret || !code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return false;
    }

    const decryptedSecret = this.decryptSecret(secret);
    if (!decryptedSecret) {
      return false;
    }

    const timeStep = 30;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(nowSeconds / timeStep);

    for (let errorWindow = -1; errorWindow <= 1; errorWindow++) {
      const generatedCode = this.generateTotpCodeForWindow(decryptedSecret, currentWindow + errorWindow);
      if (generatedCode === code) {
        return true;
      }
    }

    return false;
  }

  /**
   * Performs soft network/subnet drift checking between session IP and current IP.
   */
  public checkCidrSoftDrift(ip1: string, ip2: string): boolean {
    if (ip1 === ip2 || !ip1 || !ip2) return true;
    if (ip1 === '127.0.0.1' || ip2 === '127.0.0.1' || ip1 === '::1' || ip2 === '::1') return true;

    const ipv4Parts1 = ip1.split('.');
    const ipv4Parts2 = ip2.split('.');
    if (ipv4Parts1.length === 4 && ipv4Parts2.length === 4) {
      return (
        ipv4Parts1[0] === ipv4Parts2[0] &&
        ipv4Parts1[1] === ipv4Parts2[1] &&
        ipv4Parts1[2] === ipv4Parts2[2]
      );
    }

    return true;
  }

  private getEncryptionKey(): Buffer {
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    const configuredKey = process.env.CONTROL_PLANE_ENCRYPTION_KEY;

    if (!configuredKey && isProduction) {
      this.logger.error(
        'SECURITY CRITICAL: CONTROL_PLANE_ENCRYPTION_KEY is not set in a production/staging environment. Refusing to perform MFA secret operations.',
      );
      throw new InternalServerErrorException(
        'Control Plane MFA encryption key is not configured for this environment.',
      );
    }

    const rawKey = configuredKey || DEV_ENCRYPTION_KEY;
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  private generateTotpCodeForWindow(secret: string, timeWindow: number): string {
    const key = this.base32Decode(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(timeWindow), 0);

    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const codeNumber =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (codeNumber % 1000000).toString().padStart(6, '0');
    return otp;
  }

  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanInput = input.toUpperCase().replace(/=+$/, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < cleanInput.length; i++) {
      const idx = alphabet.indexOf(cleanInput[i]);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }
}
