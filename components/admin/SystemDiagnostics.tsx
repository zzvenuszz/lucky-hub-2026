
import React, { useState, useRef, useEffect } from 'react';

const SystemDiagnostics: React.FC = () => {
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const testCamera = async () => {
    setCameraStatus('loading');
    setErrorMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraStatus('success');
    } catch (err: any) {
      console.error("Camera error:", err);
      setCameraStatus('error');
      setErrorMessage(err.message || 'Không thể truy cập webcam');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('idle');
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Chẩn đoán hệ thống</h3>
          <p className="text-slate-400 text-xs font-medium">Kiểm tra phần cứng và kết nối API</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Webcam Test Card */}
        <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-xl">📷</div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Kiểm tra Webcam</h4>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Hardware Diagnostic</p>
            </div>
          </div>

          <div className="aspect-video bg-slate-200 rounded-3xl overflow-hidden relative mb-4 border-4 border-white shadow-inner">
            {cameraStatus === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <span className="text-4xl mb-2">📹</span>
                <p className="text-xs font-bold">Webcam chưa được kích hoạt</p>
              </div>
            )}
            {cameraStatus === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {cameraStatus === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50 text-rose-500 p-6 text-center">
                <span className="text-4xl mb-2">⚠️</span>
                <p className="text-xs font-bold">Lỗi: {errorMessage}</p>
              </div>
            )}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className={`w-full h-full object-cover ${cameraStatus === 'success' ? 'block' : 'hidden'}`}
            />
          </div>

          <div className="flex gap-2">
            {cameraStatus !== 'success' ? (
              <button 
                onClick={testCamera}
                className="flex-grow bg-emerald-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-200 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Kích hoạt Camera
              </button>
            ) : (
              <button 
                onClick={stopCamera}
                className="flex-grow bg-slate-800 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
              >
                Dừng Camera
              </button>
            )}
          </div>
          <p className="mt-4 text-[10px] text-slate-400 italic leading-relaxed">
            * Lưu ý: Nếu bạn đang chạy Magic Mirror trên trình duyệt, hãy đảm bảo đã cấp quyền truy cập Camera cho trang web này.
          </p>
        </div>

        {/* MM API Test Card */}
        <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-xl">🪞</div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Kiểm tra API Magic Mirror</h4>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">API Integration</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Mô phỏng nhận diện</p>
              <div className="flex gap-2">
                <input 
                  id="mm-test-username"
                  placeholder="Nhập username (vd: admin)" 
                  className="flex-grow bg-slate-50 border-none px-4 py-2 rounded-xl text-xs outline-none focus:ring-2 ring-emerald-500/20"
                />
                <button 
                  onClick={async () => {
                    const username = (document.getElementById('mm-test-username') as HTMLInputElement).value;
                    if (!username) return alert('Vui lòng nhập username');
                    try {
                      const res = await fetch(`/MM/${username}/info`);
                      const data = await res.json();
                      alert(JSON.stringify(data, null, 2));
                    } catch (err) {
                      alert('Lỗi kết nối API MM');
                    }
                  }}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  Test
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-900 rounded-2xl text-emerald-400 font-mono text-[10px] overflow-x-auto">
              <p className="opacity-50 mb-2">// Hướng dẫn MM</p>
              <p>1. Đảm bảo webcam đã được cắm.</p>
              <p>2. Cài đặt module nhận diện khuôn mặt.</p>
              <p>3. Kiểm tra log của Magic Mirror (npm start).</p>
              <p>4. Đảm bảo URL trong config.js là chính xác.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemDiagnostics;
