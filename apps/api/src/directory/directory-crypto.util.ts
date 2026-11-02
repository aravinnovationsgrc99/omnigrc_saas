import * as crypto from 'crypto';

/**
 * Enterprise AES-256-GCM Vault Encryptor for Directory Secrets
 * Provides authenticated encryption with integrity verification.
 */
export class DirectoryCryptoUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly AUTH_TAG_LENGTH = 16;

  private static getEncryptionKey(): Buffer {
    const rawKey =
      process.env.DIRECTORY_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      'omnigrc-vault-fallback-key-32-chars-minimum-entropy';
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypts plaintext secret using AES-256-GCM.
   * Returns formatted string: iv:authTag:ciphertext (all in hex).
   */
  public static encryptSecret(plaintext: string): string {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty or null secret.');
    }
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const key = this.getEncryptionKey();
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts ciphertext string formatted as iv:authTag:ciphertext.
   */
  public static decryptSecret(encryptedPayload: string): string {
    if (!encryptedPayload) {
      throw new Error('Cannot decrypt empty payload.');
    }
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted secret payload format.');
    }

    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = this.getEncryptionKey();

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Returns masked representation of a secret string.
   * Never exposes raw secret characters except optionally the last 4.
   */
  public static maskSecret(secret: string): string {
    if (!secret) return '••••••••••••';
    if (secret.length <= 4) return '••••••••••••';
    const last4 = secret.slice(-4);
    return `••••••••••••${last4}`;
  }
}

