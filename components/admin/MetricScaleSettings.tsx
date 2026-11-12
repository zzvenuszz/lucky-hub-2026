import React, { memo, useState } from 'react';
import { METRIC_FIELD_LABELS, METRIC_FIELD_ORDER, MetricFieldKey, MetricScaleModel } from '../../utils/metricScaleConfig.ts';

interface MetricScaleSettingsProps {
  scales: MetricScaleModel[];
  isSaving: boolean;
  onChange: (scales: MetricScaleModel[]) => void;
  onSave: () => void;
}

const MetricScaleSettings: React.FC<MetricScaleSettingsProps> = memo(({ scales, isSaving, onChange, onSave }) => {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [draggedField, setDraggedField] = useState<{ code: string; field: MetricFieldKey } | null>(null);

  const updateScale = (code: string, update: Partial<MetricScaleModel>) => {
    if (typeof update.code === 'string' && scales.some(scale => scale.code !== code && scale.code.toLowerCase() === update.code?.trim().toLowerCase())) {
      console.warn('[MetricScaleSettings] Duplicate scale code rejected:', { code: update.code });
      return;
    }
    onChange(scales.map(scale => scale.code === code ? { ...scale, ...update } : scale));
  };

  const moveField = (code: string, field: MetricFieldKey, targetIndex: number) => {
    const scale = scales.find(item => item.code === code);
    if (!scale) return;
    const order = [...scale.order];
    const sourceIndex = order.indexOf(field);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= order.length || sourceIndex === targetIndex) return;
    [order[sourceIndex], order[targetIndex]] = [order[targetIndex], order[sourceIndex]];
    updateScale(code, { order });
    console.log('[MetricScaleSettings] Scale field order changed:', { code, order });
  };

  const addScale = () => {
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) return;
    if (scales.some(scale => scale.code.toLowerCase() === code.toLowerCase())) {
      console.warn('[MetricScaleSettings] Duplicate scale code rejected:', { code });
      return;
    }
    const created: MetricScaleModel = { code, name, order: [...METRIC_FIELD_ORDER] };
    onChange([...scales, created]);
    console.log('[MetricScaleSettings] Scale model added:', { code, fieldCount: created.order.length });
    setNewCode('');
    setNewName('');
  };

  const removeScale = (code: string) => {
    if (scales.length <= 1) return;
    onChange(scales.filter(scale => scale.code !== code));
    console.log('[MetricScaleSettings] Scale model removed:', { code });
  };

  const hasInvalidScales = scales.length === 0 || scales.some(scale => !scale.code.trim() || !scale.name.trim())
    || new Set(scales.map(scale => scale.code.trim().toLowerCase())).size !== scales.length;
  const duplicateNewCode = scales.some(scale => scale.code.toLowerCase() === newCode.trim().toLowerCase());

  return (
    <section className="space-y-5" data-testid="metric-scale-settings">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-black uppercase tracking-widest text-sm text-slate-700">Thứ tự chỉ số theo mã cân</h4>
            <p className="mt-1 text-sm text-slate-500">Kéo thả để đổi thứ tự nhập. Tên và dữ liệu các chỉ số luôn được giữ nguyên.</p>
          </div>
          <button type="button" onClick={onSave} disabled={isSaving || hasInvalidScales} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            {isSaving ? 'Đang lưu…' : 'Lưu cấu hình mã cân'}
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {scales.map(scale => (
            <article key={scale.code} className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid={`metric-scale-${scale.code}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 text-xs font-bold text-slate-600">
                  Mã cân
                  <input value={scale.code} onChange={event => updateScale(scale.code, { code: event.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm" />
                </label>
                <label className="min-w-0 flex-1 text-xs font-bold text-slate-600">
                  Tên hiển thị
                  <input value={scale.name} onChange={event => updateScale(scale.code, { name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                </label>
                <button type="button" onClick={() => removeScale(scale.code)} disabled={scales.length <= 1} className="rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">Xóa mã cân</button>
              </div>

              <ol className="mt-3 space-y-2" aria-label={`Thứ tự chỉ số của cân ${scale.code}`}>
                {scale.order.map((field, index) => (
                  <li
                    key={`${scale.code}-${field}`}
                    draggable
                    onDragStart={() => setDraggedField({ code: scale.code, field })}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault();
                      if (draggedField?.code === scale.code) moveField(scale.code, draggedField.field, index);
                      setDraggedField(null);
                    }}
                    onDragEnd={() => setDraggedField(null)}
                    className={`flex min-w-0 items-center gap-2 rounded-xl border bg-white px-3 py-2.5 ${draggedField?.code === scale.code && draggedField.field === field ? 'border-emerald-400 opacity-50' : 'border-slate-200'}`}
                    data-testid={`metric-scale-order-${scale.code}-${field}`}
                  >
                    <span aria-hidden="true" className="cursor-grab select-none text-slate-400">⠿</span>
                    <span className="w-7 shrink-0 text-center text-xs font-black text-slate-400">{index + 1}</span>
                    <span className="min-w-0 flex-1 text-sm font-bold text-slate-800">{METRIC_FIELD_LABELS[field]}</span>
                    <button type="button" aria-label={`Đưa ${METRIC_FIELD_LABELS[field]} lên`} disabled={index === 0} onClick={() => moveField(scale.code, field, index - 1)} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Đưa ${METRIC_FIELD_LABELS[field]} xuống`} disabled={index === scale.order.length - 1} onClick={() => moveField(scale.code, field, index + 1)} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">↓</button>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h4 className="font-black text-sm text-slate-700">Thêm mã cân</h4>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={newCode} onChange={event => setNewCode(event.target.value)} placeholder="Mã cân, ví dụ: BC-999" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-sm" />
          <input value={newName} onChange={event => setNewName(event.target.value)} placeholder="Tên hiển thị" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
          <button type="button" onClick={addScale} disabled={!newCode.trim() || !newName.trim() || duplicateNewCode} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Thêm</button>
        </div>
      </div>
    </section>
  );
});

MetricScaleSettings.displayName = 'MetricScaleSettings';
export default MetricScaleSettings;
