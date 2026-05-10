
const axios = require("axios");

/**
 * Helper to generate TTS audio directly from the Magic Mirror.
 * This bypasses regional restrictions of the backend server.
 */
module.exports = {
  generateTTS: async (text, apiKey, modelName = 'gemini-2.0-flash', voiceName = 'Kore') => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      
      const payload = {
        contents: [{ parts: [{ text: text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName }
            }
          }
        }
      };

      console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): Sending request for text: "${text.substring(0, 30)}..."`);
      
      const response = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" }
      });

      const audioData = response.data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (!audioData) {
        throw new Error("No audio data returned from Gemini API");
      }

      return Buffer.from(audioData, 'base64');
    } catch (err) {
      const errorMsg = err.response && err.response.data && err.response.data.error 
        ? err.response.data.error.message 
        : err.message;
      console.error(`MMM-LuckyHub-FaceSync (TTS-Helper): Error generating audio: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }
};
