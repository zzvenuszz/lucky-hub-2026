import React, { useState, useEffect, memo, useCallback } from 'react';
import { Database } from '../../../services/database.ts';

interface ClineKey {
  id: string;
  key: string;
  label: string;
  display: string;
}

interface VisionModel {
  id: string;
  label: string;
}

const AIConfigPanel: React.FC = memo(() => {
  const [activeProvider, setActiveProvider] = useState<string>('gemini');
  const [clineKeys, setClineKeys] = useState<ClineKey[]>([]);
  const [visionModels, setVisionModels] = useState<VisionModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'none' | 'success' | 'error'>('none');
  const [error, setError] = useState<string | null>(null);

  // Vision Test states
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('meta-llama/llama-3.2-11b-vision-instruct');
  const [testImage, setTestImage] = useState<string | null>(null);
  const [testPrompt, setTestPrompt] = useState('Bức ảnh này có nội dung gì? Hãy phân tích và mô tả chi tiết bằng tiếng Việt.');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testCost, setTestCost] = useState<string | null>(null);
  const [testResolvedModel, setTestResolvedModel] = useState<string | null>(null);

  // Load config
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await Database.getAIConfig();
      if (config) {
        setActiveProvider(config.activeProvider || 'gemini');
        setClineKeys(config.clineKeys || []);
        setVisionModels(config.visionModels || []);
      }
    } catch (err: any) {
      console.error('[AIConfigPanel] Failed to load config:', err);
      setError('Không thể tải cấu hình AI');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Save provider
  const handleSaveProvider = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus('none');
    try {
      const result = await Database.setAIConfig(activeProvider);
      if (result?.success) {
        setSaveStatus('success');
        console.log(`[AIConfigPanel] AI provider changed to: ${activeProvider.toUpperCase()}`);
        setTimeout(() => setSaveStatus('none'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (err: any) {
      console.error('[AIConfigPanel] Failed to save config:', err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [activeProvider]);

  // Handle image selection
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setTestImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // Test Cline Vision
  const handleTestVision = useCallback(async () => {
    if (!selectedKey) {
      setError('Vui lòng chọn Cline API Key để test Vision');
      return;
    }
    if (!testImage) {
      setError('Vui lòng chọn ảnh để test Vision');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestCost(null);
    setTestResolvedModel(null);
    setError(null);

    try {
      const result = await Database.testClineVision({
        apiKey: selectedKey,
        model: selectedModel,
        imageBase64: testImage,
        prompt: testPrompt
      });

      if (result) {
        if (result.success) {
          setTestResult(result.text || '✅ Thành công nhưng không có nội dung trả về');
          setTestCost(result.cost || null);
          setTestResolvedModel(result.resolvedModel || null);
        } else {
          setError(result.error || 'Test thất bại không rõ nguyên nhân');
        }
      } else {
        setError('Không nhận được phản hồi từ server');
      }
    } catch (err: any) {
      console.error('[AIConfigPanel] Vision test failed:', err);
      setError(err.message || 'Lỗi kết nối đến server');
    } finally {
      setIsTesting(false);
    }
  }, [selectedKey, selectedModel, testImage, testPrompt]);

  return (
    <div className="space-y-8 pb-10">
      {/* ===== PHẦN 1: CHỌN AI CHÍNH ===== */}
      <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
        <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
          <span className="text-lg">⚙️</span> Cơ chế AI chính
        </h4>
        <p className="text-[10px] text-slate-500 font-medium">
          Chọn cơ chế AI nào sẽ được sử dụng cho tất cả các tác vụ AI của hệ thống
          (Chat AI, Phân tích chỉ số từ ảnh, Xác thực ảnh đại diện, Tư vấn sức khỏe...)
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gemini Option */}
          <label
            className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all ${
              activeProvider === 'gemini'
                ? 'border-emerald-500 bg-white shadow-md'
                : 'border-slate-200 bg-white/50 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="aiProvider"
              value="gemini"
              checked={activeProvider === 'gemini'}
              onChange={() => setActiveProvider('gemini')}
              className="sr-only"
            />
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
                activeProvider === 'gemini' ? 'bg-emerald-100' : 'bg-slate-100'
              }`}>
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs uppercase tracking-wider text-slate-800">
                  Google Gemini
                  {activeProvider === 'gemini' && (
                    <span className="ml-2 text-[8px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black">
                      ĐANG DÙNG
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-slate-500 mt-1 font-medium">
                  Gemini 1.5 Flash/2.0 Flash - Hỗ trợ vision, JSON schema, tốc độ cao
                </div>
              </div>
            </div>
          </label>

          {/* Cline Option */}
          <label
            className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all ${
              activeProvider === 'cline'
                ? 'border-purple-500 bg-white shadow-md'
                : 'border-slate-200 bg-white/50 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="aiProvider"
              value="cline"
              checked={activeProvider === 'cline'}
              onChange={() => setActiveProvider('cline')}
              className="sr-only"
            />
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
                activeProvider === 'cline' ? 'bg-purple-100' : 'bg-slate-100'
              }`}>
                🧠
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs uppercase tracking-wider text-slate-800">
                  CLINE
                  {activeProvider === 'cline' && (
                    <span className="ml-2 text-[8px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-black">
                      ĐANG DÙNG
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-slate-500 mt-1 font-medium">
                  DeepSeek/Llama - OpenAI-compatible, hỗ trợ vision qua image_url
                </div>
              </div>
            </div>
          </label>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={handleSaveProvider}
            disabled={isSaving}
            className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all disabled:opacity-50 hover:bg-emerald-500"
          >
            {isSaving ? '⏳ ĐANG LƯU...' : '💾 LƯU CẤU HÌNH'}
          </button>

          {saveStatus === 'success' && (
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-pulse">
              ✅ ĐÃ LƯU!
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
              ❌ LỖI LƯU!
            </span>
          )}
        </div>

        <div className="text-[9px] text-slate-400 italic">
          Lưu ý: Sau khi thay đổi, hệ thống sẽ dùng AI provider mới cho tất cả tác vụ AI ngay lập tức.
          {activeProvider === 'cline' && (
            <span className="text-amber-600 block mt-1">
              ⚠️ Cline có thể chưa hỗ trợ đầy đủ vision cho tác vụ trích xuất chỉ số (InBody). Nên test trước khi chuyển hẳn sang Cline.
            </span>
          )}
        </div>
      </div>

      {/* ===== PHẦN 2: TEST CLINE VISION ===== */}
      <div className="bg-purple-50/50 p-6 rounded-[2rem] border border-purple-100 space-y-4 shadow-sm">
        <h4 className="font-black text-purple-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
          <span className="text-lg">🧪</span> Test CLINE Vision
        </h4>
        <p className="text-[10px] text-slate-500 font-medium">
          Kiểm tra khả năng phân tích ảnh của Cline API trước khi sử dụng cho hệ thống.
          {clineKeys.length === 0 && (
            <span className="text-amber-600 block mt-1">
              ⚠️ Bạn cần thêm Cline API Key ở phần "Thêm API Key mới" phía trên trước khi test.
            </span>
          )}
        </p>

        {/* Chọn Key */}
        <div>
          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1">
            🔑 Cline API Key
          </label>
          <select
            value={selectedKey}
            onChange={e => setSelectedKey(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-purple-500 font-medium appearance-none cursor-pointer"
            disabled={clineKeys.length === 0}
          >
            <option value="">-- Chọn Cline Key --</option>
            {clineKeys.map(k => (
              <option key={k.id} value={k.key}>
                {k.label} ({k.display})
              </option>
            ))}
          </select>
        </div>

        {/* Chọn Model */}
        <div>
          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1">
            🧠 Model Vision
          </label>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-purple-500 font-medium appearance-none cursor-pointer"
          >
            {visionModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Chọn Ảnh */}
        <div>
          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1">
            🖼️ Chọn ảnh test
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="w-full bg-white border border-purple-200 rounded-xl px-4 py-3 text-sm text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[9px] file:font-black file:uppercase file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
          />
          {testImage && (
            <div className="mt-2 relative inline-block">
              <img
                src={testImage}
                alt="Test"
                className="h-32 w-auto rounded-xl border border-purple-200 shadow-sm object-cover"
              />
              <button
                onClick={() => setTestImage(null)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full text-[9px] font-black shadow hover:bg-rose-400"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Prompt */}
        <div>
          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1">
            📝 Yêu cầu phân tích
          </label>
          <textarea
            value={testPrompt}
            onChange={e => setTestPrompt(e.target.value)}
            rows={3}
            className="w-full bg-white border border-purple-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
          />
        </div>

        {/* Nút test */}
        <button
          onClick={handleTestVision}
          disabled={isTesting || !selectedKey || !testImage}
          className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all disabled:opacity-50 hover:bg-purple-500"
        >
          {isTesting ? '⏳ ĐANG PHÂN TÍCH...' : '🔬 GỬI YÊU CẦU TEST VISION'}
        </button>

        {/* Kết quả test */}
        {testResult && (
          <div className="bg-white border border-purple-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="font-black text-[10px] uppercase tracking-wider text-purple-700">
                📋 KẾT QUẢ PHÂN TÍCH
              </h5>
              <span className="text-[8px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black">
                ✅ THÀNH CÔNG
              </span>
            </div>

            {testResolvedModel && (
              <div className="text-[9px] text-slate-500 font-medium">
                🎯 Model thực thi: <span className="text-purple-600 font-black">{testResolvedModel}</span>
              </div>
            )}
            {testCost && (
              <div className="text-[9px] text-slate-500 font-medium">
                💰 Chi phí: <span className="text-amber-600 font-black">${testCost}</span>
              </div>
            )}

            <div className="bg-slate-50 rounded-xl p-4 max-h-60 overflow-y-auto">
              <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {testResult}
              </pre>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider">❌ LỖI</p>
            <p className="text-[11px] text-rose-700 mt-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-[9px] text-rose-500 font-black uppercase hover:text-rose-400"
            >
              ✕ Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

AIConfigPanel.displayName = 'AIConfigPanel';

export default AIConfigPanel;