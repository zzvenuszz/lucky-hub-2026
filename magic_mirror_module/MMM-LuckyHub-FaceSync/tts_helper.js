
const axios = require("axios");
const puter = require("puter");

/**
 * Helper to generate TTS audio directly from the Magic Mirror.
 * This bypasses regional restrictions of the backend server.
 */
module.exports = {
  generateTTS: async (text, apiKey, voiceName = 'Kore') => {
    // Phương án 1: Thử sử dụng Puter AI (Miễn phí, không cần API Key, không Quota)
    try {
      console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): [Puter] Attempting generation...`);
      // Thử dùng model gemini-2.0-flash qua Puter
      // Lưu ý: Ta vẫn cần cung cấp cấu trúc giống như API gốc để nhận về Audio
      const response = await puter.ai.chat(text, {
        model: 'gemini-2.0-flash',
        response_modalities: ["AUDIO"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: { voice_name: voiceName }
          }
        }
      });

      // Kiểm tra xem Puter có trả về dữ liệu âm thanh không
      // Puter SDK thường trả về một đối tượng có thuộc tính .text hoặc dữ liệu thô
      if (response && response.audio) {
        console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): Success with Puter!`);
        return Buffer.from(response.audio.data, 'base64');
      }
      
      // Nếu là text-only từ Puter, coi như không đạt yêu cầu TTS và chuyển sang dùng API Key
      console.warn(`MMM-LuckyHub-FaceSync (TTS-Helper): Puter returned no audio, falling back to API Keys.`);
    } catch (puterErr) {
      console.warn(`MMM-LuckyHub-FaceSync (TTS-Helper): Puter failed: ${puterErr.message}. Falling back to API Keys.`);
    }

    // Phương án 2: Sử dụng API Key hiện tại (Logic cũ)
    // Danh sách các model hỗ trợ Audio (ưu tiên các model đời mới theo skill)
    const modelsToTry = [
      'gemini-3.1-flash-tts-preview', // Model chuyên dụng cho TTS
      'gemini-2.0-flash',            // Model mới cực nhanh
      'gemini-3-flash-preview',      // Model mạnh
      'gemini-3.1-flash-lite',       // Tiết kiệm nhất
      'gemini-3.1-pro-preview'       // Model pro fallback
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
