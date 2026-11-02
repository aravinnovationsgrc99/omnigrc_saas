import * as crypto from 'crypto';

/**
 * Enterprise AES-256-GCM Vault Encryptor for Directory Secrets.
 * Provides authenticated encryption with integrity verification.
 *
 * NOTE ON KEY ROTATION VS. PAYLOAD FORMAT VERSIONING:
 * The `v1:` payload prefix denotes the serialization format (AES-256-GCM authenticated
 * ciphertext with 96-bit IV and 128-bit auth tag), NOT encryption-key versioning.
 * Multi-key re-encryption and automated key rotation are not yet implemented in code
 * and are identified as an operational pre-deployment prerequisite.
 */
export class DirectoryCryptoUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits for AES-GCM
  private static readonly AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
  private static readonly PAYLOAD_FORMAT_VERSION = 'v1';
  private static readonly REQUIRED_KEY_BYTES = 32; // 256 bits for AES-256

  /**
   * Parses and validates that raw key material resolves to exactly 32 cryptographically secure bytes.
   *
   * Supported encodings:
   * 1. Hexadecimal: Exactly 64 hex characters [0-9a-fA-F]{64} (Recommended)
   * 2. Base64: Exactly 44 characters representing 32 bytes
   * 3. Raw UTF-8: Exactly 32 characters/bytes
   *
   * Fails closed if the key material is missing, malformed, or does not resolve to exactly 32 bytes.
   */
  public static parseAndValidateKey(rawKey: string): Buffer {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new Error(
        'DIRECTORY_ENCRYPTION_KEY is missing or invalid: must be a non-empty string.',
      );
    }

    const trimmed = rawKey.trim();
    let keyBuffer: Buffer;

    // 1. 64-character hex encoding (32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      keyBuffer = Buffer.from(trimmed, 'hex');
    }
    // 2. Base64 encoding (44 characters representing 32 bytes)
    else if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed) || (/^[A-Za-z0-9+/]{44}$/.test(trimmed) && trimmed.endsWith('='))) {
      keyBuffer = Buffer.from(trimmed, 'base64');
    }
    // 3. Raw 32-byte string
    else {
      keyBuffer = Buffer.from(trimmed, 'utf8');
    }

    if (keyBuffer.length !== this.REQUIRED_KEY_BYTES) {
      throw new Error(
        `DIRECTORY_ENCRYPTION_KEY is malformed: expected exactly ${this.REQUIRED_KEY_BYTES} bytes of cryptographic key material (e.g. 64 hex characters or 32 raw bytes), but received ${keyBuffer.length} bytes.`,
      );
    }

    return keyBuffer;
  }

  /**
   * Resolves encryption key from environment configuration.
   *
   * PRODUCTION ENFORCEMENT:
   * In production (`NODE_ENV === 'production'`), a dedicated `DIRECTORY_ENCRYPTION_KEY`
   * is strictly required. There is ZERO fallback to `JWT_SECRET` or any other environment variable.
   * Missing, malformed or weak keys fail closed immediately.
   */
  public static getEncryptionKey(customKey?: string): Buffer {
    if (customKey) {
      return this.parseAndValidateKey(customKey);
    }

    const envKey = process.env.DIRECTORY_ENCRYPTION_KEY;

    if (process.env.NODE_ENV === 'production') {
      if (!envKey) {
        throw new Error(
          'Security Critical: DIRECTORY_ENCRYPTION_KEY environment variable is mandatory in production and must contain exactly 32 bytes of secure key material.',
        );
      }
      return this.parseAndValidateKey(envKey);
    }

    // In development and test environments, permit explicit key if set, or deterministic 32-byte fallback
    if (envKey) {
      return this.parseAndValidateKey(envKey);
    }

    // Deterministic 32-byte fallback key (64 hex characters) exclusively for isolated dev/test
    const fallbackHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    return Buffer.from(fallbackHex, 'hex');
  }

  /**
   * Encrypts plaintext secret using AES-256-GCM.
   * Returns payload: v1:iv:authTag:ciphertext (all payload segments in hex).
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

      return `${this.PAYLOAD_FORMAT_VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (err: any) {
      if (err.message?.includes('DIRECTORY_ENCRYPTION_KEY') || err.message?.startsWith('Security Critical:')) {
        throw err;
      }
      throw new Error(`Encryption failed: ${err.message}`);
    }
  }

  /**
   * Decrypts ciphertext string formatted as either:
   * - Versioned payload: v1:iv:authTag:ciphertext (4 segments)
   * - Legacy payload:    iv:authTag:ciphertext    (3 segments)
   *
   * Fails safely without leaking secret material or ciphertext in error messages.
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
      if (version !== this.PAYLOAD_FORMAT_VERSION) {
        throw new Error(
          `Unsupported payload format version "${version}". Expected "${this.PAYLOAD_FORMAT_VERSION}".`,
        );
      }
      ivHex = iv;
      authTagHex = tag;
      cipherHex = cipher;
    } else if (parts.length === 3) {
      // Legacy format backwards compatibility
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
      if (err.message?.includes('DIRECTORY_ENCRYPTION_KEY') || err.message?.startsWith('Security Critical:')) {
        throw err;
      }
      // Never log or leak key material, ciphertext, or credentials
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
