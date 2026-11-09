import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database } from '../../services/database.ts';
import CurrencyInput from './CurrencyInput.tsx';
import { formatVND } from '../../utils/formatters.ts';
import { normalizePriceListSkuForMatch, readPriceListFile } from './utils/priceListFileImport.ts';

interface Product { sku: string; skus?: string[]; name: string; pv: number; imageUrl?: string; categoryName?: string; prices?: Record<string, number> | null; }
interface PriceVersion { _id: string; name: string; effectiveFrom: string; effectiveTo?: string | null; endDateExplicit?: boolean; entries?: Array<Record<string, any>>; }
interface PriceRow { sku: string; skus: string[]; name: string; pv: number; categoryName: string; prices: Record<string, any>; }
interface Props { versions: PriceVersion[]; products: Product[]; canManage: boolean; onSaved: () => Promise<void>; onMessage: (message: string) => void; }
type PriceField = 'price100' | 'price25' | 'price35' | 'price42' | 'price50';
const TIERS: Array<{ field: PriceField; label: string; text: string; color: string }> = [
  { field: 'price100', label: 'Giá 100%', text: 'text-red-700', color: '#b91c1c' },
  { field: 'price25', label: 'Giá giảm 25%', text: 'text-black', color: '#000000' },
  { field: 'price35', label: 'Giá giảm 35%', text: 'text-green-700', color: '#15803d' },
  { field: 'price42', label: 'Giá giảm 42%', text: 'text-purple-700', color: '#7e22ce' },
  { field: 'price50', label: 'Giá giảm 50%', text: 'text-pink-700', color: '#be185d' },
];
const skuList = (product: Product) => [...new Set((product.skus?.length ? product.skus : [product.sku]).map(sku => String(sku).trim().toUpperCase()).filter(Boolean))];
const todayInputValue = () => {
  const today = new Date(); const pad = (value: number) => String(value).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
};
const dateToInput = (value: string | Date) => {
  const date = new Date(value); const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const currentDateTimeInputValue = () => {
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return localNow.toISOString().slice(0, 19);
};
const dateOnly = (value?: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : '';
const inclusiveEndInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value); date.setDate(date.getDate() - 1);
  return dateToInput(date);
};
const inclusiveEndLabel = (value?: string | null) => {
  const date = inclusiveEndInput(value);
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN') : '';
};
const currentStatus = (version: PriceVersion) => {
  const now = Date.now();
  if (new Date(version.effectiveFrom).getTime() > now) return 'Sắp hiệu lực';
  if (version.effectiveTo && new Date(version.effectiveTo).getTime() <= now) return 'Đã kết thúc';
  return 'Đang hiệu lực';
};
const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const addDays = (date: Date, count: number) => { const value = new Date(date); value.setDate(value.getDate() + count); return value; };

const PriceListManager: React.FC<Props> = memo(({ versions, products, canManage, onSaved, onMessage }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PriceVersion | null>(null);
  const [updatingVersion, setUpdatingVersion] = useState<PriceVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState('');
  const [name, setName] = useState('');
  const importFileInput = useRef<HTMLInputElement>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(todayInputValue);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [entries, setEntries] = useState<Record<string, Record<PriceField, string>>>({});
  const [draftProducts, setDraftProducts] = useState<Product[]>(products);
  const [newProductSkus, setNewProductSkus] = useState<Set<string>>(new Set());
  const [selectedVersionIds, setSelectedVersionIds] = useState<Set<string>>(new Set());
  const hasHistory = versions.length > 0;
  const allVersionsSelected = versions.length > 0 && selectedVersionIds.size === versions.length;

  useEffect(() => {
    const availableIds = new Set(versions.map(version => version._id));
    setSelectedVersionIds(previous => {
      const next = new Set([...previous].filter(id => availableIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [versions]);

  const toggleVersionSelection = useCallback((versionId: string) => {
    setSelectedVersionIds(previous => {
      const next = new Set(previous);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  }, []);

  const toggleAllVersionSelection = useCallback(() => {
    setSelectedVersionIds(allVersionsSelected ? new Set() : new Set(versions.map(version => version._id)));
    console.log(`[PriceListUI] ${allVersionsSelected ? 'Cleared' : 'Selected'} all price list versions`, { count: versions.length });
  }, [allVersionsSelected, versions]);
  const groupedDraftProducts = useMemo(() => {
    const groups = new Map<string, Product[]>();
    draftProducts.filter(product => product.sku).forEach(product => {
      const category = product.categoryName?.trim() || 'Chưa phân loại';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(product);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi')).map(([category, group]) => [category, group.sort((a, b) => a.name.localeCompare(b.name, 'vi'))] as const);
  }, [draftProducts]);

  const rowsForVersion = (version: PriceVersion): PriceRow[] => {
    const entryMap = new Map((version.entries || []).map(entry => [String(entry.sku).toUpperCase(), entry]));
    const used = new Set<string>();
    const rows: PriceRow[] = [];
    products.forEach(product => {
      const codes = skuList(product);
      const matching = codes.map(code => entryMap.get(code)).filter(Boolean) as Record<string, any>[];
      if (!matching.length) return;
      matching.forEach(entry => used.add(String(entry.sku).toUpperCase()));
      rows.push({ sku: product.sku, skus: codes, name: product.name, pv: Number(product.pv || 0), categoryName: product.categoryName || 'Chưa phân loại', prices: matching.find(entry => entry.sku === product.sku) || matching[0] });
    });
    (version.entries || []).forEach(entry => {
      const sku = String(entry.sku).toUpperCase();
      if (used.has(sku)) return;
      rows.push({ sku, skus: [sku], name: String(entry.name || 'Sản phẩm không còn trong kho'), pv: Number(entry.pv || 0), categoryName: String(entry.categoryName || 'Sản phẩm khác'), prices: entry });
    });
    return rows.sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'vi') || a.name.localeCompare(b.name, 'vi'));
  };

  const openCreate = () => {
    const initial: Record<string, Record<PriceField, string>> = {};
    products.filter(product => product.sku).forEach(product => {
      const source = product.prices || {};
      initial[product.sku] = Object.fromEntries(TIERS.map(tier => [tier.field, !hasHistory && source[tier.field] !== undefined ? String(source[tier.field]) : ''])) as Record<PriceField, string>;
    });
    setDraftProducts(products); setEntries(initial); setNewProductSkus(new Set()); setName(''); setEffectiveFrom(todayInputValue()); setEffectiveTo(''); setEditing(null); setUpdatingVersion(null); setImportSummary(''); setOpen(true);
  };
  const openEdit = (version: PriceVersion) => {
    setEditing(version); setUpdatingVersion(null); setNewProductSkus(new Set()); setName(version.name || ''); setEffectiveFrom(dateToInput(version.effectiveFrom)); setEffectiveTo(inclusiveEndInput(version.effectiveTo)); setOpen(true);
  };
  const openPriceUpdate = async (version: PriceVersion) => {
    setBusy(true);
    try {
      console.log('[PriceListUI] Price list update started:', { versionId: version._id, name: version.name });
      const latestProducts = await Database.inventory.priceListProducts() || [];
      const exactPriceBySku = new Map((version.entries || []).map(entry => [String(entry.sku).trim().toUpperCase(), entry]));
      const normalizedPriceBySku = new Map((version.entries || []).map(entry => [normalizePriceListSkuForMatch(entry.sku), entry]));
      const initial: Record<string, Record<PriceField, string>> = {};
      const newSkus = new Set<string>();
      latestProducts.filter((product: Product) => product.sku).forEach((product: Product) => {
        const codes = [...new Set([String(product.sku).trim().toUpperCase(), ...skuList(product)])];
        const source = codes.map(code => exactPriceBySku.get(code)).find(Boolean)
          || codes.map(code => normalizedPriceBySku.get(normalizePriceListSkuForMatch(code))).find(Boolean);
        if (!source) newSkus.add(product.sku);
        initial[product.sku] = Object.fromEntries(TIERS.map(tier => [
          tier.field,
          source?.[tier.field] !== undefined && source?.[tier.field] !== null ? String(source[tier.field]) : '',
        ])) as Record<PriceField, string>;
      });

      setDraftProducts(latestProducts);
      setEntries(initial);
      setNewProductSkus(newSkus);
      setName(version.name || '');
      setEffectiveFrom(currentDateTimeInputValue());
      setEffectiveTo('');
      setEditing(null);
      setUpdatingVersion(version);
      setImportSummary(`Đã tải lại ${latestProducts.length} sản phẩm. Giá của bảng đã chọn được giữ lại; sản phẩm mới chưa có giá đang để trống.`);
      setOpen(true);
      console.log('[PriceListUI] Price list update catalog loaded:', {
        versionId: version._id,
        productCount: latestProducts.length,
        productsWithExistingPrices: Object.values(initial).filter(prices => TIERS.every(tier => prices[tier.field] !== '')).length,
        productsWithoutPrices: Object.values(initial).filter(prices => TIERS.every(tier => prices[tier.field] === '')).length,
      });
    } catch (error: any) {
      console.error('[PriceListUI] Price list update load failed:', error);
      onMessage(error?.message || 'Không thể tải danh sách sản phẩm mới.');
    } finally {
      setBusy(false);
    }
  };
  const updatePrice = (sku: string, field: PriceField, value: string) => setEntries(old => ({ ...old, [sku]: { ...old[sku], [field]: value } }));
  const importPrices = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportSummary('');
    try {
      const result = await readPriceListFile(file);
      const firstRowBySku = new Map<string, typeof result.rows[number]>();
      const fileRowsByNormalizedSku = new Map<string, typeof result.rows>();
      result.rows.forEach(row => { if (!firstRowBySku.has(row.sku)) firstRowBySku.set(row.sku, row); });
      result.rows.forEach(row => {
        const normalizedSku = normalizePriceListSkuForMatch(row.sku);
        const matchingRows = fileRowsByNormalizedSku.get(normalizedSku) || [];
        matchingRows.push(row);
        fileRowsByNormalizedSku.set(normalizedSku, matchingRows);
      });
      const catalogDiagnostics = draftProducts.filter(product => product.sku).map(product => {
        const productCodes = [...new Set([String(product.sku).trim().toUpperCase(), ...skuList(product)])];
        return {
          product: product.name,
          primarySku: String(product.sku),
          alternateSkus: Array.isArray(product.skus) ? product.skus.join(' | ') : '(skus field missing)',
          candidateSkus: productCodes.join(' | '),
        };
      });
      const nextEntries: Record<string, Record<PriceField, string>> = { ...entries };
      draftProducts.filter(product => product.sku).forEach(product => {
        if (!nextEntries[product.sku]) nextEntries[product.sku] = Object.fromEntries(TIERS.map(tier => [tier.field, ''])) as Record<PriceField, string>;
      });

      const matchedFileSkus = new Set<string>();
      const matchDiagnostics: Array<{ product: string; primarySku: string; candidateSkus: string; matchedFileSkus: string; matchMethod: string }> = [];
      let matchedProducts = 0;
      let skippedAlreadyPriced = 0;
      draftProducts.filter(product => product.sku).forEach(product => {
        const productCodes = [...new Set([String(product.sku).trim().toUpperCase(), ...skuList(product)])];
        const exactRows = productCodes.map(code => firstRowBySku.get(code)).filter(Boolean) as typeof result.rows;
        const normalizedRows = [...new Map(productCodes.flatMap(code => fileRowsByNormalizedSku.get(normalizePriceListSkuForMatch(code)) || []).map(row => [row.sku, row])).values()];
        const matchingRows = [...new Map([...exactRows, ...normalizedRows].map(row => [row.sku, row])).values()];
        const normalizedPrimarySku = normalizePriceListSkuForMatch(product.sku);
        const matchedRow = exactRows.find(row => normalizePriceListSkuForMatch(row.sku) === normalizedPrimarySku) || exactRows[0] || normalizedRows.find(row => normalizePriceListSkuForMatch(row.sku) === normalizedPrimarySku) || normalizedRows[0];
        const matchMethod = exactRows.length ? 'exact' : normalizedRows.length ? 'removed-vn-suffix' : '';
        matchDiagnostics.push({ product: product.name, primarySku: String(product.sku), candidateSkus: productCodes.join(' | '), matchedFileSkus: matchingRows.map(row => row.sku).join(' | '), matchMethod });
        if (!matchedRow) return;

        matchedProducts += 1;
        matchingRows.forEach(row => matchedFileSkus.add(row.sku));
        const hasAnyExistingPrice = TIERS.some(tier => nextEntries[product.sku]?.[tier.field] !== undefined && nextEntries[product.sku][tier.field] !== '');
        if (hasAnyExistingPrice) {
          skippedAlreadyPriced += 1;
          return;
        }
        nextEntries[product.sku] = { ...matchedRow.prices };
      });

      const unmatchedSkus = result.rows.filter(row => !matchedFileSkus.has(row.sku)).map(row => row.sku);
      const productsMissingPrices = draftProducts.filter(product => TIERS.some(tier => !nextEntries[product.sku]?.[tier.field])).length;
      const debugDetails = {
        fileName: file.name,
        fileSkuCount: result.rows.length,
        importedSkus: result.rows.map(row => row.sku),
        catalogProductCount: catalogDiagnostics.length,
        catalog: catalogDiagnostics,
        matchedProducts,
        skippedAlreadyPriced,
        unmatchedFileSkuCount: unmatchedSkus.length,
        unmatchedFileSkus: unmatchedSkus,
        productsMissingPrices,
        duplicateFileSkus: result.duplicateSkus,
        productMatches: matchDiagnostics,
      };
      console.log(`[PriceListUI] Import matching diagnostics: ${JSON.stringify(debugDetails)}`);
      const unmatchedSummary = unmatchedSkus.length ? ` · ${unmatchedSkus.length} mã không khớp${unmatchedSkus.length <= 5 ? `: ${unmatchedSkus.join(', ')}` : ` (ví dụ: ${unmatchedSkus.slice(0, 5).join(', ')})`}` : '';
      const duplicateSummary = result.duplicateSkus.length ? ` · ${result.duplicateSkus.length} mã trùng trong file, dùng dòng xuất hiện đầu tiên` : '';
      setEntries(nextEntries);
      setImportSummary(`Đã ghép ${matchedProducts}/${draftProducts.filter(product => product.sku).length} sản phẩm · bỏ qua ${skippedAlreadyPriced} sản phẩm đã có giá · ${productsMissingPrices} sản phẩm còn thiếu ít nhất một mức giá${unmatchedSummary}${duplicateSummary}.`);
      console.log(`[PriceListUI] File import applied: ${JSON.stringify({ fileName: file.name, matchedProducts, skippedAlreadyPriced, unmatchedSkuCount: unmatchedSkus.length, productsMissingPrices, duplicateSkuCount: result.duplicateSkus.length })}`);
    } catch (error: any) {
      console.error('[PriceListUI] File import failed:', error);
      onMessage(error?.message || 'Không thể đọc dữ liệu từ tệp.');
    } finally {
      setImporting(false);
    }
  }, [draftProducts, entries, onMessage]);
  const save = async () => {
    if (!name.trim()) return onMessage('Nhập tên bảng giá.');
    if (!effectiveFrom) return onMessage('Chọn ngày bắt đầu hiệu lực.');
    if (effectiveTo && effectiveTo < effectiveFrom.slice(0, 10)) return onMessage('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
    if (!editing && !draftProducts.length) return onMessage('Kho chưa có sản phẩm để tạo bảng giá.');
    if (!editing) {
      const missing = draftProducts.find(product => !TIERS.every(tier => entries[product.sku]?.[tier.field] !== undefined && entries[product.sku][tier.field] !== ''));
      if (missing) return onMessage(`Nhập đủ 5 mức giá cho sản phẩm ${missing.name} (${skuList(missing).join(', ')}).`);
    }
    setBusy(true);
    try {
      const start = updatingVersion ? new Date(effectiveFrom) : new Date(`${effectiveFrom}T00:00:00`);
      const endExclusive = effectiveTo ? addDays(new Date(`${effectiveTo}T00:00:00`), 1) : null;
      if (editing) {
        await Database.inventory.updatePriceList(editing._id, { name: name.trim(), effectiveFrom: start.toISOString(), effectiveTo: endExclusive?.toISOString() || null });
        console.log('[PriceListUI] Metadata updated:', { id: editing._id, name: name.trim(), effectiveFrom: start.toISOString(), effectiveTo: endExclusive?.toISOString() || null });
        onMessage('Đã cập nhật tên và thời gian hiệu lực bảng giá.');
      } else {
        const payloadEntries = draftProducts.flatMap(product => skuList(product).map(sku => ({
          sku,
          name: product.name,
          pv: Number(product.pv || 0),
          categoryName: product.categoryName || '',
          costReference: Number(product.prices?.costReference || 0),
          ...Object.fromEntries(TIERS.map(tier => [tier.field, Number(entries[product.sku][tier.field])])),
        })));
        console.log(`[PriceListUI] ${updatingVersion ? 'Update' : 'Create'}: submitting price list`, { sourceVersionId: updatingVersion?._id, name: name.trim(), effectiveFrom: start.toISOString(), effectiveTo: endExclusive?.toISOString() || null, productCount: draftProducts.length, skuCount: payloadEntries.length });
        await Database.inventory.savePriceList({ name: name.trim(), effectiveFrom: start.toISOString(), effectiveTo: endExclusive?.toISOString() || null, entries: payloadEntries, note: updatingVersion ? `Cập nhật từ bảng giá ${updatingVersion.name}` : 'Tạo từ danh sách quản lý bảng giá' });
        onMessage(updatingVersion ? 'Đã tạo phiên bản bảng giá cập nhật.' : 'Đã tạo và áp dụng bảng giá.');
      }
      await onSaved(); setOpen(false); setEditing(null); setUpdatingVersion(null);
    } catch (error: any) {
      console.error('[PriceListUI] Save failed:', error);
      onMessage(error.message || 'Không thể lưu bảng giá.');
    } finally { setBusy(false); }
  };
  const remove = async (version: PriceVersion) => {
    if (!confirm(`Xóa bảng giá “${version.name}”? Nếu bảng giá đang được hóa đơn hoặc lô nhập tham chiếu, hệ thống sẽ từ chối xóa.`)) return;
    setBusy(true);
    try {
      await Database.inventory.deletePriceList(version._id);
      setSelectedVersionIds(previous => { const next = new Set(previous); next.delete(version._id); return next; });
      await onSaved(); onMessage('Đã xóa bảng giá.');
    }
    catch (error: any) { console.error('[PriceListUI] Delete failed:', error); onMessage(error.message || 'Không thể xóa bảng giá.'); }
    finally { setBusy(false); }
  };
  const removeSelected = useCallback(async () => {
    const selectedVersions = versions.filter(version => selectedVersionIds.has(version._id));
    if (!selectedVersions.length) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedVersions.length} bảng giá đã chọn? Các bảng được hóa đơn tham chiếu sẽ không thể xóa.`)) return;

    setBusy(true);
    const deletedIds: string[] = [];
    const failed: Array<{ version: PriceVersion; message: string }> = [];
    console.log('[PriceListUI] Bulk delete started:', { count: selectedVersions.length });
    try {
      for (const version of selectedVersions) {
        try {
          await Database.inventory.deletePriceList(version._id);
          deletedIds.push(version._id);
          console.log('[PriceListUI] Bulk delete succeeded:', { id: version._id, name: version.name });
        } catch (error: any) {
          const message = error?.message || 'Không thể xóa bảng giá.';
          failed.push({ version, message });
          console.error('[PriceListUI] Bulk delete failed:', { id: version._id, name: version.name, error });
        }
      }

      setSelectedVersionIds(new Set(failed.map(entry => entry.version._id)));
      await onSaved();
      if (failed.length) {
        const details = failed.slice(0, 2).map(entry => `${entry.version.name}: ${entry.message}`).join(' · ');
        const remaining = failed.length > 2 ? ` · Còn ${failed.length - 2} lỗi khác.` : '';
        onMessage(`Đã xóa ${deletedIds.length}/${selectedVersions.length} bảng giá. ${details}${remaining}`);
      } else {
        onMessage(`Đã xóa ${deletedIds.length} bảng giá.`);
      }
    } catch (error: any) {
      console.error('[PriceListUI] Bulk delete refresh failed:', error);
      onMessage(error?.message || `Đã xóa ${deletedIds.length} bảng giá nhưng không thể tải lại danh sách.`);
    } finally {
      setBusy(false);
    }
  }, [onMessage, onSaved, selectedVersionIds, versions]);
  const exportPdf = (version: PriceVersion) => {
    const win = window.open('', '_blank', 'width=1100,height=850');
    if (!win) return onMessage('Trình duyệt đã chặn cửa sổ xuất PDF. Hãy cho phép popup rồi thử lại.');
    const rows = rowsForVersion(version).map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.skus.join(', '))}</td><td>${row.pv}</td>${TIERS.map(tier => `<td style="color:${tier.color}">${escapeHtml(formatVND(row.prices[tier.field]))}</td>`).join('')}</tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(version.name)}</title><style>*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#17231f;margin:24px}h1{font-size:22px;margin:0 0 8px}p{color:#475569;margin:0 0 18px}table{width:100%;border-collapse:collapse}th,td{padding:8px 6px;border:1px solid #cbd5d1;text-align:left}th{background:#f1f5f3}th:nth-child(n+4),td:nth-child(n+4){text-align:right}.actions{margin-bottom:16px}@media print{.actions{display:none}body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><div class="actions"><button onclick="window.print()">In / Lưu PDF</button></div><h1>${escapeHtml(version.name)}</h1><p>Hiệu lực từ ${dateOnly(version.effectiveFrom)}${version.effectiveTo ? ` đến ${inclusiveEndLabel(version.effectiveTo)}` : ' · không có ngày kết thúc'}</p><table><thead><tr><th>Sản phẩm</th><th>SKU</th><th>PV</th>${TIERS.map(tier => `<th style="color:${tier.color}">${escapeHtml(tier.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`);
    win.document.close();
    console.log('[PriceListUI] PDF print view opened:', { id: version._id, name: version.name });
  };
  const exportImage = async (version: PriceVersion) => {
    const rows = rowsForVersion(version);
    const width = 1800; const left = 40; const headerHeight = 190; const rowHeight = 54; const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = headerHeight + Math.max(1, rows.length) * rowHeight + 40;
    const context = canvas.getContext('2d');
    if (!context) return onMessage('Không thể tạo ảnh bảng giá trên thiết bị này.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#17231f';
    context.font = 'bold 32px Arial'; context.fillText(version.name, left, 52, width - 2 * left);
    context.font = '18px Arial'; context.fillStyle = '#475569';
    context.fillText(`Hiệu lực từ ${dateOnly(version.effectiveFrom)}${version.effectiveTo ? ` đến ${inclusiveEndLabel(version.effectiveTo)}` : ' · không có ngày kết thúc'}`, left, 88);
    const columns = [{ label: 'Sản phẩm', x: left, width: 330 }, { label: 'SKU', x: 380, width: 390 }, { label: 'PV', x: 790, width: 80 }, ...TIERS.map((tier, index) => ({ label: tier.label, x: 900 + index * 170, width: 160 }))];
    context.fillStyle = '#e8eeeb'; context.fillRect(left, 116, width - left * 2, 42); context.font = 'bold 15px Arial'; context.fillStyle = '#17231f';
    columns.forEach(column => context.fillText(column.label, column.x + 5, 143, column.width - 10));
    rows.forEach((row, index) => {
      const y = headerHeight + index * rowHeight;
      context.strokeStyle = '#d7dfdb'; context.beginPath(); context.moveTo(left, y + rowHeight - 3); context.lineTo(width - left, y + rowHeight - 3); context.stroke();
      context.font = '14px Arial'; context.fillStyle = '#17231f'; context.fillText(row.name, columns[0].x + 5, y + 25, columns[0].width - 10);
      context.fillText(row.skus.join(', '), columns[1].x + 5, y + 25, columns[1].width - 10);
      context.fillText(String(row.pv), columns[2].x + 5, y + 25, columns[2].width - 10);
      TIERS.forEach((tier, tierIndex) => { context.fillStyle = tier.color; context.fillText(formatVND(row.prices[tier.field]), columns[tierIndex + 3].x + 5, y + 25, columns[tierIndex + 3].width - 10); });
    });
    canvas.toBlob(async blob => {
      if (!blob) return onMessage('Không thể tạo file ảnh bảng giá.');
      const file = new File([blob], `${version.name.replace(/[^\w\d-]+/g, '-')}.png`, { type: 'image/png' });
      try {
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) { await navigator.share({ files: [file], title: version.name }); }
        else { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.download = file.name; link.href = url; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
        console.log('[PriceListUI] PNG exported:', { id: version._id, bytes: blob.size });
      } catch (error: any) { if (error?.name !== 'AbortError') { console.error('[PriceListUI] PNG export failed:', error); onMessage('Không thể lưu ảnh bảng giá.'); } }
    }, 'image/png');
  };

  return <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Danh sách bảng giá</h2><p className="mt-1 text-sm text-slate-500">Giá bán được áp dụng theo ngày hiệu lực của từng bảng.</p></div>{canManage && <button onClick={openCreate} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">+ Tạo mới bảng giá</button>}</div>
    <div className="space-y-3">
      {canManage && versions.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" data-testid="price-list-bulk-toolbar">
        <span className="mr-auto text-xs font-semibold text-slate-600">{selectedVersionIds.size} / {versions.length} đã chọn</span>
        <button type="button" data-testid="toggle-all-price-lists" disabled={busy} onClick={toggleAllVersionSelection} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50">{allVersionsSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
        <button type="button" data-testid="bulk-delete-price-lists" disabled={busy || selectedVersionIds.size === 0} onClick={() => void removeSelected()} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Đang xóa…' : `Xóa đã chọn${selectedVersionIds.size ? ` (${selectedVersionIds.size})` : ''}`}</button>
      </div>}
      {versions.map(version => <div key={version._id} className="flex items-start gap-2">
        {canManage && <input type="checkbox" aria-label={`Chọn bảng giá ${version.name || dateOnly(version.effectiveFrom)}`} data-testid={`select-price-list-${version._id}`} checked={selectedVersionIds.has(version._id)} disabled={busy} onChange={() => toggleVersionSelection(version._id)} className="mt-5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-700 disabled:cursor-not-allowed" />}
        <details className="group min-w-0 flex-1 rounded-2xl border border-slate-200 p-4">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3"><span className="min-w-0"><span className="block font-black">{version.name || 'Bảng giá'}</span><span className="mt-1 block text-sm text-slate-600">Hiệu lực từ {dateOnly(version.effectiveFrom)}{version.effectiveTo ? ` đến ${inclusiveEndLabel(version.effectiveTo)}` : ' · chưa đặt ngày kết thúc'}</span></span><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${currentStatus(version) === 'Đang hiệu lực' ? 'bg-emerald-100 text-emerald-800' : currentStatus(version) === 'Sắp hiệu lực' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{currentStatus(version)}</span></summary>
        <div className="mt-3 flex flex-wrap justify-end gap-2">{canManage && <><button disabled={busy} onClick={() => openEdit(version)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">Sửa</button>{currentStatus(version) === 'Đang hiệu lực' && <button disabled={busy} onClick={() => void openPriceUpdate(version)} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Cập nhật giá</button>}<button disabled={busy} onClick={() => remove(version)} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">Xóa</button></>}<button onClick={() => exportPdf(version)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">In / Lưu PDF</button><button onClick={() => void exportImage(version)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">Lưu ảnh</button></div>
        <p className="mt-2 text-xs text-slate-500">{rowsForVersion(version).length} sản phẩm · <span className="group-open:hidden">Xem giá</span><span className="hidden group-open:inline">Thu gọn</span></p>
        <div className="mt-4 overflow-x-auto border-t pt-3"><table className="w-full min-w-[800px] text-left text-xs"><thead><tr><th className="p-2">Sản phẩm · SKU / PV</th>{TIERS.map(tier => <th key={tier.field} className={`p-2 text-right ${tier.text}`}>{tier.label}</th>)}</tr></thead><tbody>{rowsForVersion(version).map(row => <tr key={`${row.sku}-${row.name}`} className="border-t border-slate-100"><td className="p-2"><b>{row.name}</b><span className="mt-1 block text-slate-600">{row.skus.join(', ')} · {row.pv} PV</span></td>{TIERS.map(tier => <td key={tier.field} className={`p-2 text-right ${tier.text}`}>{formatVND(row.prices[tier.field])}</td>)}</tr>)}</tbody></table></div>
        </details>
      </div>)}
      {!versions.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Chưa có bảng giá nào.</div>}
    </div>
    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="price-list-modal-title">
      <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5"><div><h2 id="price-list-modal-title" className="text-lg font-black sm:text-xl">{editing ? 'Sửa bảng giá' : updatingVersion ? 'Cập nhật bảng giá' : 'Tạo bảng giá mới'}</h2><p className="mt-1 text-xs text-slate-500">{editing ? 'Sửa tên và thời gian hiệu lực của phiên bản.' : updatingVersion ? `Rà soát giá từ “${updatingVersion.name}”; sản phẩm mới chưa có giá sẽ để trống.` : 'Nhập giá mới cho toàn bộ sản phẩm trong kho.'}</p></div><div className="flex items-center gap-2">{!editing && <><input ref={importFileInput} type="file" accept=".csv,.ods,text/csv" onChange={event => void importPrices(event)} className="hidden" aria-label="Chọn file bảng giá để import" /><button type="button" onClick={() => importFileInput.current?.click()} disabled={importing || busy} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200 disabled:opacity-50">{importing ? 'Đang đọc file…' : 'Import từ file'}</button></>}<button onClick={() => setOpen(false)} aria-label="Đóng" className="rounded-lg bg-slate-100 px-3 py-2 text-lg font-bold">×</button></div></div>
        <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-3">
          <label className="text-sm font-bold">Tên bảng giá<input value={name} onChange={event => setName(event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal" placeholder="Ví dụ: Bảng giá tháng 11/2026" /></label>
          <label className="text-sm font-bold">{updatingVersion ? 'Thời điểm bắt đầu hiệu lực' : 'Ngày bắt đầu hiệu lực'}<input type={updatingVersion ? 'datetime-local' : 'date'} step={updatingVersion ? 1 : undefined} value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal" /></label>
          <label className="text-sm font-bold">Ngày kết thúc hiệu lực <span className="font-normal text-slate-500">(không bắt buộc)</span><input type="date" min={effectiveFrom.slice(0, 10)} value={effectiveTo} onChange={event => setEffectiveTo(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal" /></label>
          {!editing && importSummary && <p className="md:col-span-3 text-xs leading-5 text-slate-600" role="status">{importSummary}</p>}
        </div>
        {!editing && <div className="flex-1 overflow-auto">
          {groupedDraftProducts.length ? groupedDraftProducts.map(([category, group]) => <section key={category} className="mb-5"><h3 className="sticky left-0 z-10 border-y bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-900">{category}</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] table-fixed text-left text-xs sm:text-sm"><thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold text-slate-600"><tr><th className="w-16 p-2">Ảnh</th><th className="w-52 p-2">Sản phẩm</th><th className="w-48 p-2">SKU / PV</th>{TIERS.map(tier => <th key={tier.field} className={`w-40 p-2 text-center ${tier.text}`}>{tier.label}</th>)}</tr></thead><tbody>{group.map(product => <tr key={product.sku} className="border-b border-slate-100">
              <td className="p-2">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">Ảnh</div>}</td><td className="p-2 font-semibold"><div>{product.name}</div>{updatingVersion && newProductSkus.has(product.sku) && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{TIERS.some(tier => entries[product.sku]?.[tier.field]) ? 'Sản phẩm mới' : 'Mới · chưa có giá'}</span>}</td><td className="p-2"><div className="font-bold">{skuList(product).join(', ')}</div><div className="mt-1 text-xs text-slate-500">{Number(product.pv || 0)} PV</div></td>
              {TIERS.map(tier => <td key={tier.field} className="p-2"><CurrencyInput ariaLabel={`${tier.label} ${product.name}`} value={entries[product.sku]?.[tier.field] ?? ''} onValueChange={value => updatePrice(product.sku, tier.field, value)} placeholder="Nhập giá" className={`w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-right font-bold ${tier.text}`} /></td>)}
            </tr>)}</tbody></table></div>
          </section>) : <p className="p-8 text-center text-sm text-slate-500">Chưa có sản phẩm trong kho.</p>}
        </div>}
        <div className="flex flex-wrap justify-end gap-2 border-t bg-white p-4"><button onClick={() => setOpen(false)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">Hủy</button><button onClick={() => void save()} disabled={busy || importing || (!editing && !draftProducts.length)} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : updatingVersion ? 'Tạo phiên bản cập nhật' : 'Lưu bảng giá'}</button></div>
      </div>
    </div>}
  </div>;
});

PriceListManager.displayName = 'PriceListManager';
export default PriceListManager;
