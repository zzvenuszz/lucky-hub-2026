
import { logger } from '../utils/logger.ts';

/**
 * Service for managing configuration shared with the Magic Mirror.
 */
export const configService = {
  /**
   * Gets the configuration for the Magic Mirror.
   * @returns Configuration object containing the primary API key.
   */
  getMirrorConfig: async (): Promise<any> => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    
    if (!apiKey) {
      logger.warn('CONFIG', 'No API key found to share with Magic Mirror.');
    }

    return {
      geminiApiKey: apiKey,
      ttsModel: 'gemini-2.0-flash',
      voiceName: 'Kore'
    };
  }
};
