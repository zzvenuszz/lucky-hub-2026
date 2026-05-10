
const axios = require("axios");

/**
 * Helper to generate TTS audio directly from the Magic Mirror.
 * This bypasses regional restrictions of the backend server.
 */
module.exports = {
  generateTTS: async (text, apiKey, voiceName = 'Kore') => {
    // Danh sách các model hỗ trợ Audio hỗ trợ fallback ngay trên Mirror
    const modelsToTry = [
      'gemini-1.5-flash-latest',
      'gemini-2.0-flash',
      'gemini-1.5-flash-8b-latest',
      'gemini-1.5-flash',
      'gemini-2.0-flash-lite-preview-02-05'
    ];
    
    let lastError = null;

    for (const modelName of modelsToTry) {
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

        console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): [${modelName}] Sending request...`);
        
        const response = await axios.post(url, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 10000 // 10s timeout cho mỗi model
        });

        const audioData = response.data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (audioData) {
          console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): Success with model ${modelName}`);
          return Buffer.from(audioData, 'base64');
        }
      } catch (err) {
        const errorMsg = err.response && err.response.data && err.response.data.error 
          ? err.response.data.error.message 
          : err.message;
        
        lastError = errorMsg;
        console.warn(`MMM-LuckyHub-FaceSync (TTS-Helper): Model ${modelName} failed: ${errorMsg}`);
        
        // Nếu lỗi quá tải (429) hoặc không hỗ trợ (400), thử model tiếp theo
        if (errorMsg.includes("quota") || errorMsg.includes("429") || errorMsg.includes("modalities") || errorMsg.includes("400")) {
          continue;
        }
        // Các lỗi khác thì cũng thử model tiếp theo cho chắc
        continue;
      }
    }

    throw new Error(lastError || "All models failed on Mirror");
  }
};
