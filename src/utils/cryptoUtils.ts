
import crypto from 'crypto';

/**
 * Utility for cryptographic operations.
 */
export const cryptoUtils = {
  /**
   * Generates an MD5 hash for an avatar URL.
   * @param avatarUrl The URL of the avatar.
   * @returns The MD5 hash string.
   */
  generateAvatarHash: (avatarUrl: string | undefined): string => {
    if (!avatarUrl) return '';
    return crypto.createHash('md5').update(avatarUrl).digest('hex');
  }
};
