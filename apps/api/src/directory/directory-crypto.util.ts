import * as crypto from 'crypto';

/**
 * Enterprise AES-256-GCM Vault Encryptor for Directory Secrets
 * Provides authenticated encryption with integrity verification and versioned ciphertext support.
 */
export class DirectoryCryptoUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits recommended for AES-GCM
  private static readonly AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
  private static readonly CURRENT_VERSION = 'v1';

  /**
   * Resolves encryption key from environment configuration.
   * In production, requires a secure DIRECTORY_ENCRYPTION_KEY or JWT_SECRET.
   */
  public static getEncryptionKey(customKey?: string): Buffer {
    const rawKey =
      customKey ||
      process.env.DIRECTORY_ENCRYPTION_KEY ||
      process.env.JWT_SECRET;

    if (process.env.NODE_ENV === 'production') {
      if (!rawKey || rawKey.trim().length < 16) {
        throw new Error(
          'Security Critical: DIRECTORY_ENCRYPTION_KEY (or JWT_SECRET) with minimum 16 characters must be configured in production.',
        );
      }
      return crypto.createHash('sha256').update(rawKey.trim()).digest();
    }

    // In development and test environments, permit deterministic fallback if key is not set
    const fallbackKey = rawKey || 'omnigrc-vault-fallback-key-32-chars-minimum-entropy';
    return crypto.createHash('sha256').update(fallbackKey).digest();
  }

  /**
   * Encrypts plaintext secret using AES-256-GCM.
   * Returns versioned format: v1:iv:authTag:ciphertext (all payload segments in hex).
   */
  public static encryptSecret(plaintext: string, customKey?: string): string {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Cannot encrypt empty or non-string secret.');
    }

    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const key = this.getEncryptionKey(customKey);
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');

      return `${this.CURRENT_VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (err: any) {
      if (err.message?.startsWith('Security Critical:')) throw err;
      throw new Error(`Encryption failed: ${err.message}`);
    }
  }

  /**
   * Decrypts ciphertext string formatted as either:
   * - Versioned: v1:iv:authTag:ciphertext (4 parts)
   * - Legacy:    iv:authTag:ciphertext    (3 parts)
   */
  public static decryptSecret(encryptedPayload: string, customKey?: string): string {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') {
      throw new Error('Cannot decrypt empty or non-string payload.');
    }

    const parts = encryptedPayload.split(':');
    let ivHex: string;
    let authTagHex: string;
    let cipherHex: string;

    if (parts.length === 4) {
      const [version, iv, tag, cipher] = parts;
      if (version !== this.CURRENT_VERSION) {
        throw new Error(`Unsupported ciphertext version "${version}". Expected "${this.CURRENT_VERSION}".`);
      }
      ivHex = iv;
      authTagHex = tag;
      cipherHex = cipher;
    } else if (parts.length === 3) {
      // Legacy format backwards compatibility (v0)
      [ivHex, authTagHex, cipherHex] = parts;
    } else {
      throw new Error('Malformed encrypted secret payload format.');
    }

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const key = this.getEncryptionKey(customKey);

      if (iv.length !== this.IV_LENGTH) {
        throw new Error('Invalid initialization vector length.');
      }
      if (authTag.length !== this.AUTH_TAG_LENGTH) {
        throw new Error('Invalid authentication tag length.');
      }

      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      if (err.message?.startsWith('Security Critical:')) throw err;
      // Do not leak secret or ciphertext internals in error message
      throw new Error(
        'Vault authentication failed: payload is corrupted, tampered with, or encrypted with an invalid key.',
      );
    }
  }

  /**
   * Returns masked representation of a secret string.
   * Never exposes raw secret characters except the last 4 characters.
   */
  public static maskSecret(secret: string): string {
    if (!secret || typeof secret !== 'string') return '••••••••••••';
    const trimmed = secret.trim();
    if (trimmed.length <= 4) return '••••••••••••';
    const last4 = trimmed.slice(-4);
    return `••••••••••••${last4}`;
  }
}
