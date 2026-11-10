import React, { useState, useEffect, useCallback, memo } from 'react';
import { Database } from '../../../services/database.ts';

interface AILog {
  _id: string;
  requestId: string;
  taskType: string;
  userId?: string;
  timestamp: string;
  providerId: string;
  providerName: string;
  modelId: string;
  apiKeyLabel: string;
  durationMs: number;
  queueTimeMs: number;
  status: 'success' | 'error' | 'fallback' | 'rate_limited' | 'timeout' | 'cancelled';
  fallbackFrom?: string;
  fallbackAttempt?: number;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  debug?: {
    requestPayload?: any;
    responsePayload?: any;
    modelOptionsTried?: Array<{
      providerId: string;
      providerName: string;
      modelId: string;
      apiKeyLabel: string;
      error: string;
      errorCode: string;
      durationMs: number;
    }>;
  };
  logLevel: 'info' | 'warn' | 'error' | 'debug';
}

interface LogStats {
  overview: {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    fallbackCount: number;
    rateLimitedCount: number;
    avgDuration: number;
    totalTokens: number;
    totalCost: number;
  };
  byTaskType: Array<{
    _id: string;
    count: number;
    successCount: number;
    avgDuration: number;
    totalTokens: number;
    totalCost: number;
  }>;
  byProvider: Array<{
    _id: string;
    count: number;
    successCount: number;
    avgDuration: number;
    totalTokens: number;
    totalCost: number;
  }>;
  byStatus: Array<{
    _id: string;
    count: number;
    avgDuration: number;
  }>;
  byHour: Array<{
    _id: string;
    count: number;
    successCount: number;
    avgDuration: number;
  }>;
}

const STATUS_CONFIG: Record<string, { icon: string; label: string; color: string; bgColor: string }> = {
  success: { icon: '✅', label: 'Success', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  error: { icon: '❌', label: 'Error', color: 'text-rose-700', bgColor: 'bg-rose-100' },
  fallback: { icon: '🔄', label: 'Fallback', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  rate_limited: { icon: '⚠️', label: 'Rate Limited', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  timeout: { icon: '⏱️', label: 'Timeout', color: 'text-red-700', bgColor: 'bg-red-100' },
  cancelled: { icon: '🚫', label: 'Cancelled', color: 'text-slate-700', bgColor: 'bg-slate-100' },
};

const TASK_LABELS: Record<string, string> = {
  chat: 'Chat',
  coach: 'AI Coach',
  vision: 'Vision',
  verify: 'Verify',
  food: 'Food',
  'meal-plan': 'Meal Plan',
  embedding: 'Embedding',
};

const AILogPanel: React.FC = memo(() => {
  const [logs, setLogs] = useState<AILog[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AILog | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    page: 1,
    limit: 50,
    taskType: '',
    providerId: '',
    status: '',
    userId: '',
    requestId: '',
    startDate: '',
    endDate: '',
    logLevel: '',
  });

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.set(key, String(value));
      });
      const result = await Database.getAILogs(queryParams.toString());
      setLogs(result.logs);
    } catch (err: any) {
      setError(err.message || 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const statsData = await Database.getAILogStats(24);
      setStats(statsData);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const fetchDebugMode = useCallback(async () => {
    try {
      const status = await Database.getAIDebugMode();
      setDebugMode(status.debugMode);
    } catch (err: any) {
      console.error('Failed to get debug mode:', err);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
    fetchDebugMode();
  }, [fetchLogs, fetchStats, fetchDebugMode]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleDebugModeToggle = async (enabled: boolean) => {
    try {
      await Database.setAIDebugMode(enabled);
      setDebugMode(enabled);
      setSuccess(enabled ? 'Đã bật Debug Mode' : 'Đã tắt Debug Mode');
    } catch (err: any) {
      setError(err.message || 'Failed to toggle debug mode');
    }
  };

  const handleCleanLogs = async () => {
    const days = prompt('Xóa logs cũ hơn bao nhiêu ngày?', '30');
    if (!days) return;

    try {
      const result = await Database.cleanAILogs(parseInt(days));
      setSuccess(`Đã xóa ${result.deletedCount} logs`);
      fetchLogs();
    } catch (err: any) {
      setError(err.message || 'Failed to clean logs');
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return 'Free';
    if (cost < 0.001) return `$${cost.toFixed(6)}`;
    return `$${cost.toFixed(4)}`;
  };

  const clearMessages = () => { setError(null); setSuccess(null); };

  const getProviderOptions = () => {
    const providers = [...new Set(logs.map(l => l.providerName))];
    return providers.map(p => ({ value: p, label: p }));
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">📋 AI Logs</h3>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={e => handleDebugModeToggle(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span className={`text-sm font-medium ${debugMode ? 'text-purple-700' : 'text-slate-600'}`}>
              🐛 Debug Mode
            </span>
          </label>
          <button
            onClick={handleCleanLogs}
            className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200"
          >
            🗑️ Clean Logs
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4">
          <p className="text-rose-700 font-medium">❌ {error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
          <p className="text-emerald-700 font-medium">✅ {success}</p>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Tổng Requests</p>
            <p className="text-2xl font-black text-slate-800">{stats.overview.totalRequests || 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Tỷ lệ thành công</p>
            <p className="text-2xl font-black text-emerald-600">
              {stats.overview.totalRequests > 0
                ? `${((stats.overview.successCount / stats.overview.totalRequests) * 100).toFixed(1)}%`
                : '0%'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Thời gian TB</p>
            <p className="text-2xl font-black text-slate-800">
              {stats.overview.avgDuration ? formatDuration(stats.overview.avgDuration) : '—'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Chi phí</p>
            <p className="text-2xl font-black text-amber-600">
              {formatCost(stats.overview.totalCost || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <select
            value={filters.taskType}
            onChange={e => handleFilterChange('taskType', e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Tất cả Task</option>
            {Object.entries(TASK_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filters.providerId}
            onChange={e => handleFilterChange('providerId', e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Tất cả Provider</option>
            {getProviderOptions().map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={e => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Tất cả Status</option>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.icon} {config.label}</option>
            ))}
          </select>
          <select
            value={filters.logLevel}
            onChange={e => handleFilterChange('logLevel', e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Tất cả Level</option>
            <option value="debug">🐛 Debug</option>
            <option value="info">ℹ️ Info</option>
            <option value="warn">⚠️ Warn</option>
            <option value="error">❌ Error</option>
          </select>
          <input
            type="text"
            placeholder="Request ID..."
            value={filters.requestId}
            onChange={e => handleFilterChange('requestId', e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 flex-1 min-w-[150px]"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={filters.startDate}
              onChange={e => handleFilterChange('startDate', e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="self-center text-slate-400">→</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => handleFilterChange('endDate', e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Đang tải logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p className="font-medium">Không có log nào</p>
            <p className="text-sm mt-1">Thử điều chỉnh bộ lọc hoặc đợi có request AI mới</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Request ID</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Task</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Provider / Model</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Tokens / Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => {
                  const statusConfig = STATUS_CONFIG[log.status] || STATUS_CONFIG.error;
                  return (
                    <tr key={log._id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => { setSelectedLog(log); setShowDetail(true); }}>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-500 truncate max-w-[120px]">
                        {log.requestId}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">
                          {TASK_LABELS[log.taskType] || log.taskType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="font-medium">{log.providerName}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{log.modelId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusConfig.bgColor} ${statusConfig.color}`}>
                          {statusConfig.icon} {statusConfig.label}
                          {log.fallbackAttempt && log.fallbackAttempt > 1 && (
                            <span className="ml-1">#{log.fallbackAttempt}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">
                        {formatDuration(log.durationMs)}
                        {log.queueTimeMs > 0 && (
                          <span className="text-amber-600 ml-1">(+{formatDuration(log.queueTimeMs)} queue)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div>{log.usage.totalTokens.toLocaleString()} tokens</div>
                        <div className="text-xs text-amber-600">{formatCost(log.usage.costUsd)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedLog(log); setShowDetail(true); }}
                          className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200"
                        >
                          🔍 Xem
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Trang {filters.page} • {logs.length} logs
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(filters.page - 1)}
              disabled={filters.page <= 1 || isLoading}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              ← Trước
            </button>
            <button
              onClick={() => handlePageChange(filters.page + 1)}
              disabled={logs.length < filters.limit || isLoading}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              Tiếp →
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetail && selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50" onClick={() => setShowDetail(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[calc(100dvh-24px)] sm:max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="font-black text-slate-800">Log Detail: {selectedLog.requestId}</h4>
                <p className="text-sm text-slate-500 mt-0.5">
                  {new Date(selectedLog.timestamp).toLocaleString()} • {TASK_LABELS[selectedLog.taskType] || selectedLog.taskType}
                </p>
              </div>
              <button onClick={() => setShowDetail(false)} className="p-2 text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[70vh] space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <h5 className="font-black text-slate-700 uppercase tracking-wider text-xs mb-3">Basic Info</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Request ID</span><span className="font-mono font-bold">{selectedLog.requestId}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">User ID</span><span className="font-mono font-bold">{selectedLog.userId || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Provider</span><span className="font-bold">{selectedLog.providerName}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Model</span><span className="font-bold">{selectedLog.modelId}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">API Key</span><span className="font-mono text-sm">{selectedLog.apiKeyLabel}</span></div>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <h5 className="font-black text-slate-700 uppercase tracking-wider text-xs mb-3">Result</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-bold ${STATUS_CONFIG[selectedLog.status]?.color || 'text-slate-700'}`}>{STATUS_CONFIG[selectedLog.status]?.icon} {STATUS_CONFIG[selectedLog.status]?.label}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Duration</span><span className="font-bold font-mono">{formatDuration(selectedLog.durationMs)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Queue Time</span><span className="font-bold font-mono">{formatDuration(selectedLog.queueTimeMs)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Tokens</span><span className="font-bold">{selectedLog.usage.totalTokens.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Cost</span><span className="font-bold text-amber-600">{formatCost(selectedLog.usage.costUsd)}</span></div>
                    {selectedLog.fallbackFrom && (
                      <div className="flex justify-between"><span className="text-slate-500">Fallback từ</span><span className="font-bold text-amber-600">{selectedLog.fallbackFrom} (attempt #{selectedLog.fallbackAttempt})</span></div>
                    )}
                    {selectedLog.errorCode && (
                      <div className="flex justify-between"><span className="text-slate-500">Error Code</span><span className="font-bold text-rose-600 font-mono text-xs">{selectedLog.errorCode}</span></div>
                    )}
                    {selectedLog.httpStatus && (
                      <div className="flex justify-between"><span className="text-slate-500">HTTP Status</span><span className="font-bold">{selectedLog.httpStatus}</span></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {selectedLog.errorMessage && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                  <h5 className="font-black text-rose-700 uppercase tracking-wider text-xs mb-2">Error Message</h5>
                  <pre className="text-sm text-rose-700 whitespace-pre-wrap font-mono">{selectedLog.errorMessage}</pre>
                </div>
              )}

              {/* Models Tried (Fallback Chain) */}
              {selectedLog.debug?.modelOptionsTried && selectedLog.debug.modelOptionsTried.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h5 className="font-black text-amber-700 uppercase tracking-wider text-xs mb-3">Fallback Chain (Models Tried)</h5>
                  <div className="space-y-2">
                    {selectedLog.debug.modelOptionsTried.map((opt, i) => (
                      <div key={i} className="p-3 bg-white rounded-lg border border-slate-100">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="w-6 text-center font-bold text-slate-400">{i + 1}</span>
                          <span className="font-medium text-slate-700">{opt.providerName}</span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">{opt.modelId}</span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">{opt.apiKeyLabel}</span>
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">{opt.errorCode || 'ERROR'}</span>
                          <span className="text-sm text-slate-500 ml-auto font-mono">{formatDuration(opt.durationMs)}</span>
                        </div>
                        {opt.error && (
                          <p className="text-xs text-rose-600 mt-1 font-mono ml-9">{opt.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug Payloads */}
              {debugMode && (selectedLog.debug?.requestPayload || selectedLog.debug?.responsePayload) && (
                <div className="space-y-4">
                  {selectedLog.debug?.requestPayload && (
                    <div className="bg-slate-900 rounded-xl p-4">
                      <h5 className="font-black text-slate-300 uppercase tracking-wider text-xs mb-2">Request Payload (Sanitized)</h5>
                      <pre className="text-slate-100 text-xs whitespace-pre-wrap overflow-x-auto max-h-60">{JSON.stringify(selectedLog.debug.requestPayload, null, 2)}</pre>
                    </div>
                  )}
                  {selectedLog.debug?.responsePayload && (
                    <div className="bg-emerald-900 rounded-xl p-4">
                      <h5 className="font-black text-emerald-200 uppercase tracking-wider text-xs mb-2">Response Payload</h5>
                      <pre className="text-emerald-100 text-xs whitespace-pre-wrap overflow-x-auto max-h-60">{JSON.stringify(selectedLog.debug.responsePayload, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

AILogPanel.displayName = 'AILogPanel';
export default AILogPanel;