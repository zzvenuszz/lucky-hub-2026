
import React, { useState, memo } from 'react';
import { AuditLog } from '../../types.ts';
import LogFilters from './audit/LogFilters.tsx';
import LogTable from './audit/LogTable.tsx';

interface AuditLogsProps {
  logs: AuditLog[];
}

const AuditLogs: React.FC<AuditLogsProps> = ({ logs }) => {
  const [auditFilter, setAuditFilter] = useState<string>('ALL');

  const filteredLogs = logs.filter(log => auditFilter === 'ALL' || log.type === auditFilter);

  return (
    <div className="space-y-6 animate-in fade-in">
      <LogFilters auditFilter={auditFilter} setAuditFilter={setAuditFilter} />
      <LogTable logs={filteredLogs} />
    </div>
  );
};

export default memo(AuditLogs);
