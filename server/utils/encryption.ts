/**
 * AES-256-GCM Encryption Utility
 * Used for encrypting/decrypting API keys, tokens, and sensitive data
 */

import crypto from 'crypto';

const SPECIAL_KEY_CHARACTERS = "!@#$%^&*()-_=+[]{}?.,:;/\\|~`'\"";
let cachedConfiguredKey = '';
let cachedEncryptionKey: Buffer | null = null;

export function isStrongEncryptionPassphrase(value: string): boolean {
  return value.length >= 8
    && value.length <= 256
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /[0-9]/.test(value)
    && [...value].some(character => SPECIAL_KEY_CHARACTERS.includes(character));
}

export function isValidConfiguredEncryptionKey(value: string): boolean {
  const decoded = Buffer.from(value, 'base64');
  return isStrongEncryptionPassphrase(value)
    || (decoded.length === 32 && decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, ''));
}

// Keep accepting legacy 32-byte base64 keys while deriving setup passphrases to 256-bit keys.
function getEncryptionKey(): Buffer {
  const configuredKey = process.env.AI_ENCRYPTION_KEY;
  if (!configuredKey) {
    throw new Error('AI_ENCRYPTION_KEY environment variable is required.');
  }
  if (cachedEncryptionKey && cachedConfiguredKey === configuredKey) return cachedEncryptionKey;

  const legacyKey = Buffer.from(configuredKey, 'base64');
  const canonicalLegacyKey = legacyKey.toString('base64').replace(/=+$/, '');
  if (legacyKey.length === 32 && canonicalLegacyKey === configuredKey.replace(/=+$/, '')) {
    cachedEncryptionKey = legacyKey;
  } else {
    if (!isStrongEncryptionPassphrase(configuredKey)) {
      throw new Error('AI_ENCRYPTION_KEY must be a 32-byte base64 key or a strong passphrase with uppercase, lowercase, number, and special character.');
    }
    cachedEncryptionKey = crypto.scryptSync(configuredKey, 'lucky-hub-2026:AI_ENCRYPTION_KEY:v1', 32);
  }

  cachedConfiguredKey = configuredKey;
  return cachedEncryptionKey;
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns base64 encoded string: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypt ciphertext encrypted with encrypt()
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) return '';

  try {
    const key = getEncryptionKey();
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return plaintext.toString('utf8');
  } catch (err: any) {
    console.error('[Encryption] Decrypt failed:', err.message);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Encrypt multiple strings at once (for bulk operations)
 */
export function encryptMultiple(plaintexts: string[]): string[] {
  return plaintexts.map(encrypt);
}

/**
 * Decrypt multiple strings at once
 */
export function decryptMultiple(encrypted: string[]): string[] {
  return encrypted.map(decrypt);
}

/**
 * Mask API key for display (show first 6 and last 4 chars)
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return '••••••';
  return `${key.substring(0, 6)}••••${key.substring(key.length - 4)}`;
}

/**
 * Generate a setup passphrase that meets the wizard complexity policy.
 */
export function generateEncryptionKey(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = SPECIAL_KEY_CHARACTERS;
  const allCharacters = uppercase + lowercase + digits + special;
  const requiredCharacters = [
    uppercase[crypto.randomInt(uppercase.length)],
    lowercase[crypto.randomInt(lowercase.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
  ];

  while (requiredCharacters.length < 32) {
    requiredCharacters.push(allCharacters[crypto.randomInt(allCharacters.length)]);
  }
  for (let index = requiredCharacters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [requiredCharacters[index], requiredCharacters[swapIndex]] = [requiredCharacters[swapIndex], requiredCharacters[index]];
  }
  return requiredCharacters.join('');
}