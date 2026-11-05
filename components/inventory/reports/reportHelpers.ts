export type ReportPeriodType = 'week' | 'month' | 'quarter' | 'year' | 'herbalife_fy' | 'custom';
export type TopCustomerPeriodType = 'year' | 'month' | 'quarter' | 'herbalife_fy' | 'sync';
export type CustomerSortField = 'sales' | 'pv';
export type PieGroupingMode = 'product' | 'category';
export type PieMetricMode = 'sales' | 'units' | 'pv';

export interface StockReportItem {
  id: string;
  sku: string;
  skus: string[];
  name: string;
  categoryName: string;
  imageUrl: string;
  pv: number;
  quantity: number;
  lowStockThreshold: number;
  archived: boolean;
  costValue: number;
  avgUnitCost: number;
  totalPv: number;
  retailPrice: number;
  retailValue: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'archived';
}

export interface StockSummary {
  totalItems: number;
  totalAllItems: number;
  totalUnits: number;
  totalCostValue: number;
  totalPv: number;
  lowStockCount: number;
  outOfStockCount: number;
  archivedCount: number;
  estimated: {
    price100: number;
    price25: number;
    price35: number;
    price42: number;
    price50: number;
  };
}

export interface TrendBucket {
  key: string;
  label: string;
  fullLabel: string;
  sales: number;
  pv: number;
  orders: number;
  units: number;
  cost: number;
  profit: number;
}

export interface ProductBreakdownEntry {
  itemId: string;
  sku: string;
  name: string;
  categoryName: string;
  units: number;
  sales: number;
  pv: number;
  cost: number;
  profit: number;
  salesPercent: number;
  unitsPercent: number;
  pvPercent: number;
}

export interface CategoryBreakdownEntry {
  categoryName: string;
  units: number;
  sales: number;
  pv: number;
  cost: number;
  profit: number;
  salesPercent: number;
  unitsPercent: number;
  pvPercent: number;
}

export interface TopCustomerEntry {
  key: string;
  buyerUserId: string | null;
  buyerName: string;
  memberNumber: string;
  buyerPhone: string;
  buyerType: string;
  orders: number;
  units: number;
  sales: number;
  pv: number;
  lastPurchaseAt: string;
}

export interface InventoryAnalyticsReport {
  range: {
    from: string;
    to: string;
    periodType: ReportPeriodType;
    granularity: 'day' | 'month';
    herbalifeFiscalYear: number;
    label: string;
  };
  stockSummary: StockSummary;
  stockItems: StockReportItem[];
  salesSummary: {
    orders: number;
    units: number;
    sales: number;
    pv: number;
    cost: number;
    profit: number;
  };
  trendSeries: TrendBucket[];
  breakdown: {
    byProduct: ProductBreakdownEntry[];
    byCategory: CategoryBreakdownEntry[];
  };
  topCustomers: {
    rangeLabel: string;
    periodType: string;
    from: string;
    to: string;
    customers: TopCustomerEntry[];
  };
}

export const getDefaultHerbalifeFiscalYear = (date: Date = new Date()): number => {
  // Năm tài chính Herbalife bắt đầu từ 01/02/YYYY đến 31/01/(YYYY+1)
  return date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear();
};

export const formatDateInput = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const getSelectableYears = (centerYear: number = new Date().getFullYear()): number[] => {
  const years: number[] = [];
  for (let y = centerYear + 1; y >= centerYear - 5; y--) {
    years.push(y);
  }
  return years;
};

export const PIE_COLORS = [
  '#059669',
  '#0284c7',
  '#7c3aed',
  '#d97706',
  '#e11d48',
  '#0d9488',
  '#4f46e5',
  '#ea580c',
  '#16a34a',
  '#9333ea',
  '#2563eb',
  '#64748b',
];
