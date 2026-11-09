import * as XLSX from 'xlsx';

export type ImportedPriceField = 'price100' | 'price25' | 'price35' | 'price42' | 'price50';

export interface ImportedPriceRow {
  sku: string;
  prices: Record<ImportedPriceField, string>;
  rowNumber: number;
}

export interface PriceListFileImportResult {
  rows: ImportedPriceRow[];
  duplicateSkus: string[];
}

const HEADER_FIELDS: Record<string, ImportedPriceField> = {
  '100': 'price100',
  '25': 'price25',
  '35': 'price35',
  '42': 'price42',
  '50': 'price50',
};

const normalizeHeader = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const normalizeSku = (value: unknown) => String(value ?? '').trim().toUpperCase();

const parsePrice = (value: unknown, rowNumber: number, field: ImportedPriceField): string => {
  const source = String(value ?? '').trim();
  if (!source || source === '-' || source === '—') return '';

  const cleaned = source.replace(/[₫đ\s]/gi, '');
  const separators = [...cleaned.matchAll(/[.,]/g)];
  let normalized = cleaned;
  if (separators.length) {
    const lastSeparator = separators[separators.length - 1].index!;
    const decimalDigits = cleaned.length - lastSeparator - 1;
    if (decimalDigits > 0 && decimalDigits < 3) {
      normalized = `${cleaned.slice(0, lastSeparator).replace(/[.,]/g, '')}.${cleaned.slice(lastSeparator + 1)}`;
    } else {
      normalized = cleaned.replace(/[.,]/g, '');
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Giá ở dòng ${rowNumber} không hợp lệ (${field}).`);
  }
  return String(parsed);
};

const isSkuHeader = (value: unknown) => {
  const header = normalizeHeader(value);
  return ['masp', 'masanpham', 'sku', 'mahang', 'mahangan'].includes(header);
};

/** Reads the first worksheet from a CSV or ODS file and maps product codes to price tiers. */
export const readPriceListFile = async (file: File): Promise<PriceListFileImportResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'ods'].includes(extension || '')) {
    throw new Error('Chỉ hỗ trợ tệp .csv và .ods.');
  }

  console.log(`[PriceListImport] File read started: ${JSON.stringify({ name: file.name, size: file.size, extension })}`);
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) throw new Error('Tệp không có trang dữ liệu để đọc.');

  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  const headerIndex = table.slice(0, 30).findIndex(row => row.some(isSkuHeader));
  if (headerIndex < 0) throw new Error('Không tìm thấy cột mã sản phẩm (Mã SP hoặc SKU).');

  const headers = table[headerIndex];
  const skuColumn = headers.findIndex(isSkuHeader);
  const priceColumns = new Map<ImportedPriceField, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header).replace(/^gia/, '').replace(/phantram$/, '');
    const field = HEADER_FIELDS[normalized];
    if (field !== undefined) priceColumns.set(field, index);
  });
  if (!priceColumns.size) throw new Error('Không tìm thấy cột giá 100%, 25%, 35%, 42% hoặc 50%.');

  const detectedColumns = {
    fileName: file.name,
    sheetName: firstSheetName,
    headerRow: headerIndex + 1,
    headers,
    skuColumn,
    priceColumns: Object.fromEntries(priceColumns),
  };
  console.log(`[PriceListImport] Detected table columns: ${JSON.stringify(detectedColumns)}`);

  const rows: ImportedPriceRow[] = [];
  const seenSkus = new Set<string>();
  const duplicateSkus = new Set<string>();
  table.slice(headerIndex + 1).forEach((row, offset) => {
    const sku = normalizeSku(row[skuColumn]);
    if (!sku) return;
    if (seenSkus.has(sku)) duplicateSkus.add(sku);
    seenSkus.add(sku);
    const prices = Object.fromEntries(
      (['price100', 'price25', 'price35', 'price42', 'price50'] as ImportedPriceField[])
        .map(field => [field, priceColumns.has(field) ? parsePrice(row[priceColumns.get(field)!], headerIndex + offset + 2, field) : '']),
    ) as Record<ImportedPriceField, string>;
    rows.push({ sku, prices, rowNumber: headerIndex + offset + 2 });
  });

  if (!rows.length) throw new Error('Không tìm thấy dòng dữ liệu có mã sản phẩm trong tệp.');
  console.log(`[PriceListImport] File parsed: ${JSON.stringify({ name: file.name, rowCount: rows.length, duplicateSkuCount: duplicateSkus.size, skuRows: rows.map(row => ({ row: row.rowNumber, sku: row.sku })) })}`);
  return { rows, duplicateSkus: [...duplicateSkus] };
};
