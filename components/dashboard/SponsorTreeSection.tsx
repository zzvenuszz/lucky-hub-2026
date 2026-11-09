import React, { memo, useEffect, useState } from 'react';
import { Database } from '../../services/database.ts';

interface SponsorNode {
  id: string;
  fullName: string;
  memberNumber: string;
  memberLevel: string;
}

interface SponsorUpline {
  nodes: SponsorNode[];
  pendingSponsorNumber: string;
}

interface SponsorTreeSectionProps {
  userId: string;
}

const LEVEL_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  member: 'Hội viên',
  senior_consultant: 'Tư vấn viên cao cấp',
  success_builder: 'Nhà kiến tạo thành công',
  supervisor: 'Giám sát viên',
};

const SponsorTreeSection: React.FC<SponsorTreeSectionProps> = memo(({ userId }) => {
  const [tree, setTree] = useState<SponsorUpline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    console.log('[SponsorTreeUI] Loading upline:', { userId });
    Database.getSponsorUpline(userId)
      .then(result => {
        if (!active) return;
        setTree(result || { nodes: [], pendingSponsorNumber: '' });
        console.log('[SponsorTreeUI] Upline loaded:', { userId, nodeCount: result?.nodes?.length || 0, hasPendingSponsor: Boolean(result?.pendingSponsorNumber) });
      })
      .catch((loadError: any) => {
        if (!active) return;
        setError(loadError?.message || 'Không tải được tuyến bảo trợ.');
        console.error('[SponsorTreeUI] Upline load failed:', { userId, error: loadError });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  return (
    <section className="rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-[0_16px_40px_rgba(16,185,129,0.07)] sm:p-7" aria-labelledby="sponsor-tree-title">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-xl" aria-hidden="true">🌿</span>
        <div>
          <h2 id="sponsor-tree-title" className="text-xl font-black text-slate-800 sm:text-2xl">Nhánh bảo trợ</h2>
          <p className="mt-1 text-sm text-slate-500">Sơ đồ tuyến trên của hội viên đang được xem.</p>
        </div>
      </div>

      {loading && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Đang tải tuyến bảo trợ…</p>}
      {!loading && error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
      {!loading && !error && tree && (
        <div className="flex flex-col items-center">
          {tree.pendingSponsorNumber && <>
            <div className="w-full max-w-md rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Đang chờ người bảo trợ đăng ký mã này</p>
              <p className="mt-1 text-sm font-black text-amber-900">{tree.pendingSponsorNumber}</p>
            </div>
            {tree.nodes.length > 0 && <div className="h-6 w-0.5 bg-amber-200" aria-hidden="true" />}
          </>}
          {tree.nodes.map((node, index) => {
            const isSelectedMember = index === tree.nodes.length - 1;
            return <React.Fragment key={node.id}>
              <article className={`w-full max-w-md rounded-2xl border px-4 py-3 ${isSelectedMember ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-800">{node.fullName}{isSelectedMember && <span className="ml-2 rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-black uppercase text-white">Đang xem</span>}</p>
                    <p className="mt-1 text-xs text-slate-500">{node.memberNumber || 'Chưa có mã hội viên'}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-100">{LEVEL_LABELS[node.memberLevel] || LEVEL_LABELS.customer}</span>
                </div>
              </article>
              {index < tree.nodes.length - 1 && <div className="h-6 w-0.5 bg-emerald-200" aria-hidden="true" />}
            </React.Fragment>;
          })}
          {!tree.nodes.length && <p className="w-full max-w-md rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Chưa có dữ liệu tuyến bảo trợ.</p>}
        </div>
      )}
    </section>
  );
});

SponsorTreeSection.displayName = 'SponsorTreeSection';

export default SponsorTreeSection;
