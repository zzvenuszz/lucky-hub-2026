
/**
 * Utility for audio buffer manipulation.
 */
export const audioUtils = {
  /**
   * Adds 1 second of silence to the beginning of a WAV buffer.
   * Assumes 24kHz, 16-bit, Mono (standard Gemini TTS output).
   * @param wavBuffer The original WAV buffer from Gemini.
   * @returns A new buffer with 1 second of silence at the start.
   */
  addSilenceToWav: (wavBuffer: Buffer): Buffer => {
    try {
      // Standard WAV header is 44 bytes
      if (wavBuffer.length < 44) return wavBuffer;

      // 24kHz, 16-bit, Mono = 24000 samples/sec * 2 bytes/sample = 48000 bytes/sec
      const silenceSize = 48000;
      const silence = Buffer.alloc(silenceSize, 0);

      // Create new buffer: Header (44) + Silence (48000) + Original Data (wavBuffer - 44)
      const newBuffer = Buffer.concat([
        wavBuffer.subarray(0, 44),
        silence,
        wavBuffer.subarray(44)
      ]);

      // Update ChunkSize (offset 4): Total file size - 8
      const newChunkSize = newBuffer.length - 8;
      newBuffer.writeUInt32LE(newChunkSize, 4);

      // Update Subchunk2Size (offset 40): Data size
      const newDataSize = newBuffer.length - 44;
      newBuffer.writeUInt32LE(newDataSize, 40);

      return newBuffer;
    } catch (err) {
      console.error("[AudioUtils] Error adding silence:", err);
      return wavBuffer;
    }
  }
};
