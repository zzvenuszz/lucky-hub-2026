
import React, { useState, memo } from 'react';
import { AuditLog, AuditLogType } from '../../types.ts';

interface AuditLogsProps {
  logs: AuditLog[];
}

const AuditLogs: React.FC<AuditLogsProps> = ({ logs }) => {
  const [auditFilter, setAuditFilter] = useState<string>('ALL');

  const filteredLogs = logs.filter(log => auditFilter === 'ALL' || log.type === auditFilter);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lọc theo sự kiện:</span>
        <select 
          value={auditFilter} 
          onChange={e => setAuditFilter(e.target.value)}
          className="bg-white border-slate-200 rounded-lg text-xs font-bold px-3 py-1.5 outline-none ring-1 ring-slate-100 shadow-sm"
        >
          <option value="ALL">Tất cả sự kiện</option>
          <option value={AuditLogType.REGISTER}>Đăng ký mới</option>
          <option value={AuditLogType.POST_CREATE}>Bài viết mới</option>
          <option value={AuditLogType.METRIC_UPDATE}>Tự cập nhật chỉ số</option>
          <option value={AuditLogType.METRIC_HELP_UPDATE}>Cập nhật chỉ số giúp</option>
        </select>
      </div>
      <div className="overflow-x-auto border border-slate-50 rounded-2xl shadow-sm">
        <table className="w-full text-[11px] text-left">
          <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
            <tr>
              <th className="p-4">Thời gian</th>
              <th className="p-4">Người thực hiện</th>
              <th className="p-4">Loại sự kiện</th>
              <th className="p-4">Đối tượng tác động</th>
              <th className="p-4">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredLogs.map(log => (
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
            {filteredLogs.length === 0 && (
              <tr><td colSpan={5} className="p-20 text-center text-slate-300 italic uppercase font-black text-[10px] tracking-widest">Không tìm thấy bản ghi phù hợp</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default memo(AuditLogs);
