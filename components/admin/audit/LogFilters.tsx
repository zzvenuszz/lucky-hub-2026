
import React, { memo } from 'react';
import { AuditLogType } from '../../../types.ts';

interface LogFiltersProps {
  auditFilter: string;
  setAuditFilter: (filter: string) => void;
}

const LogFilters: React.FC<LogFiltersProps> = ({ auditFilter, setAuditFilter }) => {
  return (
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
  );
};

export default memo(LogFilters);
