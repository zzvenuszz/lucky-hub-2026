
import { Modality } from "@google/genai";
import { logger } from '../utils/logger.ts';
import { audioUtils } from '../utils/audioUtils.ts';

/**
 * Service for Text-to-Speech operations.
 */
export const ttsService = {
  /**
   * Generates a greeting audio for a user.
   * @param name The name of the user.
   * @param customPrompt A custom prompt if provided.
   * @param callAIWithRetry Function to call Gemini with retry logic.
   * @returns A Buffer containing the WAV audio with 1 second of silence at the start.
   */
  generateGreeting: async (
    name: string, 
    customPrompt: string | undefined, 
    callAIWithRetry: (requestId: string, model: string, payload: any) => Promise<any>
  ): Promise<Buffer | null> => {
    const requestId = `TTS-${Math.random().toString(36).substring(7).toUpperCase()}`;
    logger.info('TTS', `Request greeting for: ${name} (ID: ${requestId})${customPrompt ? ' with custom prompt' : ''}`);

    try {
      const prompt = customPrompt || `Nói một cách thân thiện và ấm áp: Xin chào ${name}, chúc bạn một ngày vui vẻ.`;
      
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' is good for Vietnamese
            },
          },
        },
      };

      // Use 'gemini-3.1-flash-tts-preview' as recommended in SKILL.md for TTS tasks
      let response;
      try {
        response = await callAIWithRetry(requestId, "gemini-3.1-flash-tts-preview", payload);
      } catch (innerErr: any) {
        if (innerErr.message?.includes("location is not supported")) {
          logger.error('TTS', `Location blocked for gemini-3.1-flash-tts-preview. This usually happens when the server is in a restricted region.`);
          return null;
        }
        // If the TTS model itself is not found or fails, try the latest flash model as a final fallback
        // though standard flash might not support AUDIO modality in all regions/versions
        try {
          logger.warn('TTS', `Gemini-3.1-flash-tts-preview failed, attempting fallback to gemini-flash-latest`);
          response = await callAIWithRetry(requestId, "gemini-flash-latest", payload);
        } catch (finalErr: any) {
          logger.error('TTS', `Final fallback failed: ${finalErr.message}`);
          return null;
        }
      }
      
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64Audio) {
        const originalBuffer = Buffer.from(base64Audio, 'base64');
        logger.info('TTS', `Successfully generated audio for: ${name} (${originalBuffer.length} bytes)`);

        // Thêm 1 giây im lặng vào đầu lời chào để tránh lag
        const audioBuffer = audioUtils.addSilenceToWav(originalBuffer);
        logger.info('TTS', `Added 1s silence to greeting for: ${name} (New size: ${audioBuffer.length} bytes)`);

        return audioBuffer;
      } else {
        logger.error('TTS', `Failed to generate audio for: ${name} - No audio data in response`);
        return null;
      }
    } catch (err: any) {
      logger.error('TTS', `Error for ${name} (ID: ${requestId}): ${err.message}`);
      throw err;
    }
  }
};
