
const axios = require("axios");
const path = require("path");
const fs = require("fs");

let puter = null;
try {
  // Thử load file SDK cục bộ V2 nếu có trong cùng thư mục
  const localPuterPath = path.join(__dirname, 'puter.v2.js');
  if (fs.existsSync(localPuterPath)) {
    puter = require(localPuterPath);
    if (!puter || !puter.ai) {
        puter = global.puter;
    }
    if (puter && puter.ai) {
      console.log("MMM-LuckyHub-FaceSync (TTS-Helper): ✅ Puter SDK V2 loaded successfully.");
    }
  } else {
    puter = require("puter");
  }
} catch (e) {
  console.warn("MMM-LuckyHub-FaceSync (TTS-Helper): Puter module not found or failed to load. Will try global.puter.");
}

/**
 * Helper to generate TTS audio directly from the Magic Mirror.
 * This bypasses regional restrictions of the backend server.
 */
module.exports = {
  generateTTS: async (text, apiKey, voiceName = 'Kore') => {
    // Phương án 1: Thử sử dụng Puter AI (Miễn phí, không cần API Key, không Quota)
    const currentPuter = puter || global.puter;
    if (currentPuter && currentPuter.ai) {
      try {
        console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): [Puter V2] Requesting audio for: "${text.substring(0, 20)}..."`);
        
        // Puter AI V2 API: sử dụng ai.chat với modality AUDIO
        const response = await currentPuter.ai.chat(text, {
          model: 'gemini-2.0-flash',
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName }
            }
          }
        });

        // V2 Audio response handling
        if (response && response.audio) {
          const audioBase64 = response.audio.data;
          if (audioBase64) {
            console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): [Puter] SUCCESS! Audio received (${audioBase64.length} bytes).`);
            return Buffer.from(audioBase64, 'base64');
          }
        } else if (response && response.text) {
          console.warn(`MMM-LuckyHub-FaceSync (TTS-Helper): [Puter] Received TEXT instead of AUDIO. Content: ${response.text.substring(0, 30)}...`);
        }
        
        console.warn(`MMM-LuckyHub-FaceSync (TTS-Helper): Puter fallback triggered (no audio object).`);
      } catch (puterErr) {
        console.error(`MMM-LuckyHub-FaceSync (TTS-Helper): [Puter] FAILED with error: ${puterErr.message}`);
      }
    } else {
      console.log(`MMM-LuckyHub-FaceSync (TTS-Helper): Puter AI not available (Upload puter.v2.js to fix).`);
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
