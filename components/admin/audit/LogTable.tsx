
import React, { memo } from 'react';
import { AuditLog, AuditLogType } from '../../../types.ts';

interface LogTableProps {
  logs: AuditLog[];
}

const getTypeBadge = (type: AuditLogType) => {
  const config: Record<string, { bg: string; text: string; label: string; icon: string }> = {
    [AuditLogType.REGISTER]: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Đăng ký', icon: '📝' },
    [AuditLogType.POST_CREATE]: { bg: 'bg-purple-100', text: 'text-purple-600', label: 'Bài viết', icon: '📰' },
    [AuditLogType.METRIC_HELP_UPDATE]: { bg: 'bg-amber-100', text: 'text-amber-600', label: 'Cập nhật giúp', icon: '📊' },
  };
  return config[type] || { bg: 'bg-emerald-100', text: 'text-emerald-600', label: 'Tự cập nhật', icon: '✅' };
};

const LogTable: React.FC<LogTableProps> = ({ logs }) => {
  return (
    <>
      {/* 📱 Mobile Cards */}
      <div className="mobile-only space-y-3">
        {logs.map(log => {
          const typeCfg = getTypeBadge(log.type);
          return (
            <div key={log._id || log.id} className="data-card">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-slate-800 truncate">{log.actorName}</div>
                  <div className="text-[9px] text-slate-400">🆔 {log.actorId?.substring(0, 8)}...</div>
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase shrink-0 ml-2 ${typeCfg.bg} ${typeCfg.text}`}>
                  {typeCfg.icon} {typeCfg.label}
                </span>
              </div>

              <div className="data-card-row">
                <span className="data-card-label">🕐 Thời gian</span>
                <span className="data-card-value text-slate-600">{new Date(log.timestamp).toLocaleString('vi-VN')}</span>
              </div>
              
              {log.targetName && (
                <div className="data-card-row">
                  <span className="data-card-label">📄 Đối tượng</span>
                  <span className="data-card-value text-slate-700">{log.targetName}</span>
                </div>
              )}

              {log.details && (
                <div className="mt-2 pt-2 border-t border-slate-50">
                  <span className="data-card-label block mb-1">📝 Chi tiết</span>
                  <p className="text-[11px] text-slate-600 italic leading-relaxed">{log.details}</p>
                </div>
              )}
            </div>
          );
        })}
        {logs.length === 0 && (
          <div className="p-10 text-center text-slate-300 italic text-[11px] font-bold">Không tìm thấy bản ghi</div>
        )}
      </div>

      {/* 💻 Desktop Table */}
      <div className="table-desktop">
        <div className="overflow-x-auto border border-slate-50 rounded-2xl shadow-sm">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
              <tr>
                <th className="p-4">Thời gian</th>
                <th className="p-4">Người thực hiện</th>
                <th className="p-4">Loại sự kiện</th>
                <th className="p-4">Đối tượng</th>
                <th className="p-4">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(log => (
                <tr key={log._id || log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 whitespace-nowrap text-slate-400">{new Date(log.timestamp).toLocaleString('vi-VN')}</td>
                  <td className="p-4">
                    <div className="font-bold text-slate-700">{log.actorName}</div>
                    <div className="text-[9px] text-slate-400">ID: {log.actorId}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${
                      log.type === AuditLogType.REGISTER ? 'bg-blue-100 text-blue-600' :
                      log.type === AuditLogType.POST_CREATE ? 'bg-purple-100 text-purple-600' :
                      log.type === AuditLogType.METRIC_HELP_UPDATE ? 'bg-amber-100 text-amber-600' :
                      'bg-emerald-100 text-emerald-600'
                    }`}>
                      {log.type === AuditLogType.REGISTER ? 'Đăng ký' :
                       log.type === AuditLogType.POST_CREATE ? 'Bài viết' :
                       log.type === AuditLogType.METRIC_HELP_UPDATE ? 'Cập nhật giúp' : 'Tự cập nhật'}
                    </span>
                  </td>
                  <td className="p-4">
                    {log.targetName ? (
                      <>
                        <div className="font-bold text-slate-700">{log.targetName}</div>
                        <div className="text-[9px] text-slate-400">ID: {log.targetId}</div>
                      </>
                    ) : <span className="text-slate-300">--</span>}
                  </td>
                  <td className="p-4 text-slate-600 italic leading-relaxed">{log.details}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="p-20 text-center text-slate-300 italic uppercase font-black text-[10px] tracking-widest">Không tìm thấy bản ghi</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default memo(LogTable);
