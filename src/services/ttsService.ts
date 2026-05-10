
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
    callAIWithRetry: (requestId: string, model: string, payload: any, retries?: number, strictModel?: boolean) => Promise<any>
  ): Promise<Buffer | null> => {
    const requestId = `TTS-${Math.random().toString(36).substring(7).toUpperCase()}`;
    logger.info('TTS', `Request greeting for: ${name} (ID: ${requestId})${customPrompt ? ' with custom prompt' : ''}`);

    try {
      const prompt = customPrompt || `Nói một cách thân thiện và ấm áp: Xin chào ${name}, chúc bạn một ngày vui vẻ.`;
      
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' is good for Vietnamese
            },
          },
        },
      };

      // Try multiple models in sequence that support AUDIO modality
      const modelsToTry = [
        "gemini-3.1-flash-tts-preview", // Dedicated TTS model
        "gemini-2.0-flash",             // High quality
        "gemini-3.1-flash-lite",        // Fast and efficient
        "gemini-3-flash-preview",       // Latest flash
        "gemini-3.1-pro-preview"        // High quality fallback
      ];

      let response = null;
      let lastError = null;

      for (const model of modelsToTry) {
        try {
          logger.info('TTS', `Trying to generate audio with model: ${model} (ID: ${requestId})`);
          // Use strictModel=true to ensure we only use the specified model for this audio task
          response = await callAIWithRetry(requestId, model, payload, 3, true);
          if (response) break;
        } catch (innerErr: any) {
          lastError = innerErr;
          const isLocationError = innerErr.message?.toLowerCase().includes("location is not supported");
          const isQuotaError = innerErr.message?.toLowerCase().includes("quota") || innerErr.message?.includes("429");
          
          logger.warn('TTS', `Model ${model} failed: ${innerErr.message} (ID: ${requestId})`);
          
          // If it's a quota error, we might want to try another key with the same model (handled by callAIWithRetry)
          // or move to the next model. Location errors definitely mean we should try a different model/server.
          continue;
        }
      }

      if (!response) {
        const errorMsg = lastError ? lastError.message : "All models failed to generate audio";
        logger.error('TTS', `Final failure for ${name}: ${errorMsg} (ID: ${requestId})`);
        
        // If it's specifically a location error, we still return null to trigger 204
        // because there's nothing we can do from this server region.
        if (lastError?.message?.toLowerCase().includes("location is not supported")) {
          return null;
        }
        
        // For other errors (like Quota), we throw so the mirror knows IT IS an error, not just "not available"
        throw new Error(errorMsg);
      }
      
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64Audio) {
        const originalBuffer = Buffer.from(base64Audio, 'base64');
        logger.info('TTS', `Successfully generated audio for: ${name} (${originalBuffer.length} bytes) using Gemini (ID: ${requestId})`);

        // Thêm 1 giây im lặng vào đầu lời chào để tránh lag
        const audioBuffer = audioUtils.addSilenceToWav(originalBuffer);
        logger.info('TTS', `Added 1s silence to greeting for: ${name} (New size: ${audioBuffer.length} bytes)`);

        return audioBuffer;
      } else {
        logger.error('TTS', `Failed to generate audio for: ${name} - No audio data in response (ID: ${requestId})`);
        return null;
      }
    } catch (err: any) {
      logger.error('TTS', `Unhandled error for ${name} (ID: ${requestId}): ${err.message}`);
      throw err;
    }
  }
};
