import { InventoryItem, InventoryLot, PriceListVersion, Sale } from '../models/Inventory.ts';
import { User } from '../models/User.ts';

export type ReportPeriodType = 'week' | 'month' | 'quarter' | 'year' | 'herbalife_fy' | 'custom';

export interface ReportDateRange {
  from: Date;
  to: Date;
  periodType: ReportPeriodType;
  granularity: 'day' | 'month';
  herbalifeFiscalYear?: number;
  label: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export const resolveHerbalifeFiscalYear = (refDate: Date = new Date()): number => {
  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0 = Jan, 1 = Feb
  return month === 0 ? year - 1 : year;
};

export const computeReportDateRange = (params: {
  periodType?: string;
  year?: number;
  month?: number; // 1..12
  quarter?: number; // 1..4
  fiscalYear?: number; // Herbalife FY: 01/02/fiscalYear -> 31/01/(fiscalYear+1)
  weekDate?: string;
  from?: string;
  to?: string;
}): ReportDateRange => {
  const now = new Date();
  const rawType = String(params.periodType || 'month') as ReportPeriodType;
  const periodType: ReportPeriodType = ['week', 'month', 'quarter', 'year', 'herbalife_fy', 'custom'].includes(rawType)
    ? rawType
    : 'month';

  if (periodType === 'week') {
    const base = params.weekDate ? new Date(params.weekDate) : now;
    const validBase = Number.isNaN(base.getTime()) ? now : base;
    const dayOfWeek = validBase.getDay(); // 0 (Sun) .. 6 (Sat)
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const from = new Date(validBase.getFullYear(), validBase.getMonth(), validBase.getDate() + diffToMonday, 0, 0, 0, 0);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
    return {
      from,
      to,
      periodType,
      granularity: 'day',
      label: `Tuần (${pad2(from.getDate())}/${pad2(from.getMonth() + 1)}/${from.getFullYear()} - ${pad2(to.getDate())}/${pad2(to.getMonth() + 1)}/${to.getFullYear()})`,
    };
  }

  if (periodType === 'month') {
    const year = Number.isInteger(Number(params.year)) && Number(params.year) > 2000 ? Number(params.year) : now.getFullYear();
    const month = Number.isInteger(Number(params.month)) && Number(params.month) >= 1 && Number(params.month) <= 12
      ? Number(params.month)
      : now.getMonth() + 1;
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    return {
      from,
      to,
      periodType,
      granularity: 'day',
      label: `Tháng ${pad2(month)}/${year}`,
    };
  }

  if (periodType === 'quarter') {
    const year = Number.isInteger(Number(params.year)) && Number(params.year) > 2000 ? Number(params.year) : now.getFullYear();
    const quarter = Number.isInteger(Number(params.quarter)) && Number(params.quarter) >= 1 && Number(params.quarter) <= 4
      ? Number(params.quarter)
      : Math.floor(now.getMonth() / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    const from = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const to = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
    return {
      from,
      to,
      periodType,
      granularity: 'month',
      label: `Quý ${quarter}/${year}`,
    };
  }

  if (periodType === 'year') {
    const year = Number.isInteger(Number(params.year)) && Number(params.year) > 2000 ? Number(params.year) : now.getFullYear();
    const from = new Date(year, 0, 1, 0, 0, 0, 0);
    const to = new Date(year, 11, 31, 23, 59, 59, 999);
    return {
      from,
      to,
      periodType,
      granularity: 'month',
      label: `Năm ${year} (01/01/${year} - 31/12/${year})`,
    };
  }

  if (periodType === 'herbalife_fy') {
    const fy = Number.isInteger(Number(params.fiscalYear)) && Number(params.fiscalYear) > 2000
      ? Number(params.fiscalYear)
      : resolveHerbalifeFiscalYear(now);
    // Năm tài chính Herbalife: từ 01/02/fy đến 31/01/(fy + 1)
    const from = new Date(fy, 1, 1, 0, 0, 0, 0);
    const to = new Date(fy + 1, 1, 0, 23, 59, 59, 999); // Ngày cuối cùng của tháng 1 năm (fy + 1) là 31/01
    return {
      from,
      to,
      periodType,
      granularity: 'month',
      herbalifeFiscalYear: fy,
      label: `Năm tài chính Herbalife ${fy} (01/02/${fy} - 31/01/${fy + 1})`,
    };
  }

  // Custom date range
  const parsedFrom = params.from ? new Date(params.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const parsedTo = params.to ? new Date(params.to) : now;
  const fromDate = Number.isNaN(parsedFrom.getTime()) ? new Date(now.getFullYear(), now.getMonth(), 1) : parsedFrom;
  const toDate = Number.isNaN(parsedTo.getTime()) ? now : parsedTo;
  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  return {
    from,
    to,
    periodType: 'custom',
    granularity: diffDays <= 62 ? 'day' : 'month',
    label: `Tùy chỉnh (${pad2(from.getDate())}/${pad2(from.getMonth() + 1)}/${from.getFullYear()} - ${pad2(to.getDate())}/${pad2(to.getMonth() + 1)}/${to.getFullYear()})`,
  };
};

const buildEmptyTrendBuckets = (range: ReportDateRange) => {
  const buckets = new Map<string, {
    key: string;
    label: string;
    fullLabel: string;
    sales: number;
    pv: number;
    orders: number;
    units: number;
    cost: number;
    profit: number;
  }>();

  if (range.granularity === 'day') {
    const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
    const endDay = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate());
    const weekDayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    while (cursor <= endDay) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const d = cursor.getDate();
      const key = `${y}-${pad2(m)}-${pad2(d)}`;
      const shortDate = `${pad2(d)}/${pad2(m)}`;
      const label = range.periodType === 'week' ? `${weekDayLabels[cursor.getDay()]} ${shortDate}` : shortDate;
      buckets.set(key, {
        key,
        label,
        fullLabel: `${weekDayLabels[cursor.getDay()]}, ${pad2(d)}/${pad2(m)}/${y}`,
        sales: 0,
        pv: 0,
        orders: 0,
        units: 0,
        cost: 0,
        profit: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    const endMonth = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
    while (cursor <= endMonth) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const key = `${y}-${pad2(m)}`;
      buckets.set(key, {
        key,
        label: `T${pad2(m)}/${String(y).slice(-2)}`,
        fullLabel: `Tháng ${pad2(m)}/${y}`,
        sales: 0,
        pv: 0,
        orders: 0,
        units: 0,
        cost: 0,
        profit: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return buckets;
};

const extractSaleNetLines = (sale: any) => {
  const returnedByItem = new Map<string, number>();
  for (const ret of sale.returnedLines || []) {
    const k = String(ret.itemId);
    returnedByItem.set(k, (returnedByItem.get(k) || 0) + Number(ret.quantity || 0));
  }

  const netLines: Array<{
    itemId: string;
    sku: string;
    name: string;
    netQty: number;
    unitPrice: number;
    pv: number;
    unitCost: number;
    sales: number;
    totalPv: number;
    cost: number;
    profit: number;
  }> = [];

  for (const line of sale.lines || []) {
    const itemId = String(line.itemId);
    const soldQty = Number(line.quantity || 0);
    const remainingReturnToDeduct = returnedByItem.get(itemId) || 0;
    const deducted = Math.min(soldQty, remainingReturnToDeduct);
    if (deducted > 0) returnedByItem.set(itemId, remainingReturnToDeduct - deducted);
    const netQty = Math.max(0, soldQty - deducted);
    if (netQty <= 0) continue;

    const unitPrice = Number(line.unitPrice || 0);
    const pv = Number(line.pv || 0);
    const unitCost = Number(line.unitCost || 0);
    const sales = netQty * unitPrice;
    const totalPv = Number((netQty * pv).toFixed(2));
    const cost = netQty * unitCost;
    netLines.push({
      itemId,
      sku: String(line.sku || ''),
      name: String(line.name || ''),
      netQty,
      unitPrice,
      pv,
      unitCost,
      sales,
      totalPv,
      cost,
      profit: sales - cost,
    });
  }

  return netLines;
};

const aggregateCustomersFromSales = async (sales: any[]) => {
  const grouped = new Map<string, {
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
  }>();

  for (const sale of sales) {
    const netLines = extractSaleNetLines(sale);
    const netSales = netLines.reduce((s, l) => s + l.sales, 0);
    const netPv = Number(netLines.reduce((s, l) => s + l.totalPv, 0).toFixed(2));
    const netUnits = netLines.reduce((s, l) => s + l.netQty, 0);
    if (netUnits <= 0 && netSales <= 0) continue;

    const buyerUserId = sale.buyerUserId ? String(sale.buyerUserId) : null;
    const cleanName = String(sale.buyerName || 'Khách lẻ').trim() || 'Khách lẻ';
    const cleanPhone = String(sale.buyerPhone || '').trim();
    const cleanMemberNo = String(sale.buyerMemberNumber || '').trim();
    const key = buyerUserId
      ? `member:${buyerUserId}`
      : `guest:${cleanName.toLowerCase()}:${cleanPhone}`;

    const existing = grouped.get(key) || {
      key,
      buyerUserId,
      buyerName: cleanName,
      memberNumber: ['undefined', 'null'].includes(cleanMemberNo.toLowerCase()) ? '' : cleanMemberNo,
      buyerPhone: cleanPhone,
      buyerType: String(sale.buyerType || 'custom'),
      orders: 0,
      units: 0,
      sales: 0,
      pv: 0,
      lastPurchaseAt: new Date(sale.soldAt).toISOString(),
    };

    existing.orders += 1;
    existing.units += netUnits;
    existing.sales += netSales;
    existing.pv = Number((existing.pv + netPv).toFixed(2));
    if (new Date(sale.soldAt).getTime() > new Date(existing.lastPurchaseAt).getTime()) {
      existing.lastPurchaseAt = new Date(sale.soldAt).toISOString();
    }
    if (!existing.memberNumber && cleanMemberNo && !['undefined', 'null'].includes(cleanMemberNo.toLowerCase())) {
      existing.memberNumber = cleanMemberNo;
    }
    grouped.set(key, existing);
  }

  const memberIds = [...grouped.values()]
    .map(entry => entry.buyerUserId)
    .filter((id): id is string => Boolean(id));

  if (memberIds.length > 0) {
    const users = await User.find({ _id: { $in: memberIds } })
      .select('_id fullName memberNumber phoneNumber')
      .lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));
    for (const entry of grouped.values()) {
      if (entry.buyerUserId && userMap.has(entry.buyerUserId)) {
        const u: any = userMap.get(entry.buyerUserId);
        if (u.fullName) entry.buyerName = String(u.fullName).trim();
        const mNo = String(u.memberNumber || '').trim();
        if (mNo && !['undefined', 'null'].includes(mNo.toLowerCase())) {
          entry.memberNumber = mNo;
        }
        if (!entry.buyerPhone && u.phoneNumber) {
          entry.buyerPhone = String(u.phoneNumber).trim();
        }
      }
    }
  }

  return [...grouped.values()];
};

export const buildInventoryAnalyticsReport = async (ownerId: string, query: Record<string, any>) => {
  console.log('[InventoryReportService] Generating report started:', { ownerId, query });

  const mainRange = computeReportDateRange({
    periodType: query.periodType,
    year: query.year ? Number(query.year) : undefined,
    month: query.month ? Number(query.month) : undefined,
    quarter: query.quarter ? Number(query.quarter) : undefined,
    fiscalYear: query.fiscalYear ? Number(query.fiscalYear) : undefined,
    weekDate: query.weekDate ? String(query.weekDate) : undefined,
    from: query.from ? String(query.from) : undefined,
    to: query.to ? String(query.to) : undefined,
  });

  // Top customers period: defaults to 'year', 'month', 'quarter', or 'sync' with mainRange
  const topCustomerPeriod = String(query.topCustomerPeriod || 'year');
  const topRange = topCustomerPeriod === 'sync'
    ? mainRange
    : computeReportDateRange({
        periodType: topCustomerPeriod,
        year: query.topCustomerYear ? Number(query.topCustomerYear) : undefined,
        month: query.topCustomerMonth ? Number(query.topCustomerMonth) : undefined,
        quarter: query.topCustomerQuarter ? Number(query.topCustomerQuarter) : undefined,
        fiscalYear: query.topCustomerFiscalYear ? Number(query.topCustomerFiscalYear) : undefined,
      });

  const now = new Date();
  const [allItems, activeLots, activePriceList] = await Promise.all([
    InventoryItem.find({ ownerId }).sort({ name: 1 }).lean(),
    InventoryLot.find({ ownerId, remainingQuantity: { $gt: 0 } }).lean(),
    PriceListVersion.findOne({
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
    }).sort({ effectiveFrom: -1 }).lean(),
  ]);

  const priceMap = new Map<string, any>(
    ((activePriceList as any)?.entries || []).map((entry: any) => [String(entry.sku).toUpperCase(), entry])
  );

  const lotCostByItem = new Map<string, { remainingQty: number; totalCost: number }>();
  for (const lot of activeLots as any[]) {
    const key = String(lot.itemId);
    const current = lotCostByItem.get(key) || { remainingQty: 0, totalCost: 0 };
    current.remainingQty += Number(lot.remainingQuantity || 0);
    current.totalCost += Number(lot.remainingQuantity || 0) * Number(lot.unitCost || 0);
    lotCostByItem.set(key, current);
  }

  const itemCategoryMap = new Map<string, string>();
  const stockEstimated = { price100: 0, price25: 0, price35: 0, price42: 0, price50: 0 };
  let totalStockUnits = 0;
  let totalStockCostValue = 0;
  let totalStockPv = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let archivedCount = 0;

  const stockItems = (allItems as any[]).map(item => {
    const itemId = String(item._id);
    const skus = Array.isArray(item.skus) && item.skus.length ? item.skus : [item.sku];
    const priceEntry = priceMap.get(String(item.sku).toUpperCase())
      || skus.map((s: string) => priceMap.get(String(s).toUpperCase())).find(Boolean)
      || null;
    const categoryName = String(item.categoryName || priceEntry?.categoryName || '').trim() || 'Chưa phân loại';
    itemCategoryMap.set(itemId, categoryName);

    const quantity = Number(item.quantity || 0);
    const pv = Number(item.pv || 0);
    const threshold = Number(item.lowStockThreshold ?? 5);
    const lotInfo = lotCostByItem.get(itemId);
    const costValue = lotInfo ? lotInfo.totalCost : quantity * Number(priceEntry?.costReference || 0);
    const avgUnitCost = quantity > 0 ? Math.round(costValue / quantity) : Number(priceEntry?.costReference || 0);
    const itemPvTotal = Number((quantity * pv).toFixed(2));

    let stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'archived' = 'in_stock';
    if (item.archived) {
      stockStatus = 'archived';
      archivedCount += 1;
    } else {
      totalStockUnits += quantity;
      totalStockCostValue += costValue;
      totalStockPv = Number((totalStockPv + itemPvTotal).toFixed(2));
      if (quantity <= 0) {
        stockStatus = 'out_of_stock';
        outOfStockCount += 1;
      } else if (quantity <= threshold) {
        stockStatus = 'low_stock';
        lowStockCount += 1;
      }
      if (priceEntry) {
        stockEstimated.price100 += quantity * Number(priceEntry.price100 || 0);
        stockEstimated.price25 += quantity * Number(priceEntry.price25 || 0);
        stockEstimated.price35 += quantity * Number(priceEntry.price35 || 0);
        stockEstimated.price42 += quantity * Number(priceEntry.price42 || 0);
        stockEstimated.price50 += quantity * Number(priceEntry.price50 || 0);
      }
    }

    return {
      id: itemId,
      sku: String(item.sku),
      skus,
      name: String(item.name),
      categoryName,
      imageUrl: String(item.imageUrl || ''),
      pv,
      quantity,
      lowStockThreshold: threshold,
      archived: Boolean(item.archived),
      costValue,
      avgUnitCost,
      totalPv: itemPvTotal,
      retailPrice: Number(priceEntry?.price100 || 0),
      retailValue: quantity * Number(priceEntry?.price100 || 0),
      stockStatus,
    };
  });

  // Buyer filter handling (search by buyer name or member number)
  const buyerQuery = String(query.buyerQuery || '').trim();
  const buyerUserIdFilter = String(query.buyerUserId || '').trim();

  const saleFilter: Record<string, any> = {
    ownerId,
    status: { $ne: 'cancelled' },
    soldAt: { $gte: mainRange.from, $lte: mainRange.to },
  };

  if (buyerUserIdFilter) {
    saleFilter.buyerUserId = buyerUserIdFilter;
  } else if (buyerQuery) {
    const escaped = buyerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchedUsers = await User.find({
      $or: [
        { fullName: { $regex: escaped, $options: 'i' } },
        { memberNumber: { $regex: escaped, $options: 'i' } },
      ],
    }).select('_id').lean();
    const matchedIds = matchedUsers.map((u: any) => u._id);
    saleFilter.$or = [
      { buyerName: { $regex: escaped, $options: 'i' } },
      { buyerMemberNumber: { $regex: escaped, $options: 'i' } },
      ...(matchedIds.length ? [{ buyerUserId: { $in: matchedIds } }] : []),
    ];
  }

  const [periodSales, topPeriodSales] = await Promise.all([
    Sale.find(saleFilter).sort({ soldAt: 1 }).lean(),
    topRange.from.getTime() === mainRange.from.getTime() && topRange.to.getTime() === mainRange.to.getTime()
      ? Promise.resolve(null)
      : Sale.find({
          ownerId,
          status: { $ne: 'cancelled' },
          soldAt: { $gte: topRange.from, $lte: topRange.to },
          ...(buyerUserIdFilter ? { buyerUserId: buyerUserIdFilter } : saleFilter.$or ? { $or: saleFilter.$or } : {}),
        }).sort({ soldAt: 1 }).lean(),
  ]);

  const trendBuckets = buildEmptyTrendBuckets(mainRange);
  const productAgg = new Map<string, {
    itemId: string;
    sku: string;
    name: string;
    categoryName: string;
    units: number;
    sales: number;
    pv: number;
    cost: number;
    profit: number;
  }>();
  const categoryAgg = new Map<string, {
    categoryName: string;
    units: number;
    sales: number;
    pv: number;
    cost: number;
    profit: number;
  }>();

  let totalSalesRevenue = 0;
  let totalSalesPv = 0;
  let totalSalesUnits = 0;
  let totalSalesCost = 0;
  let totalValidOrders = 0;

  for (const sale of periodSales as any[]) {
    const netLines = extractSaleNetLines(sale);
    const saleRevenue = netLines.reduce((s, l) => s + l.sales, 0);
    const salePv = Number(netLines.reduce((s, l) => s + l.totalPv, 0).toFixed(2));
    const saleUnits = netLines.reduce((s, l) => s + l.netQty, 0);
    const saleCost = netLines.reduce((s, l) => s + l.cost, 0);
    if (saleUnits <= 0 && saleRevenue <= 0) continue;

    totalValidOrders += 1;
    totalSalesRevenue += saleRevenue;
    totalSalesPv = Number((totalSalesPv + salePv).toFixed(2));
    totalSalesUnits += saleUnits;
    totalSalesCost += saleCost;

    const soldDate = new Date(sale.soldAt);
    const bucketKey = mainRange.granularity === 'day'
      ? `${soldDate.getFullYear()}-${pad2(soldDate.getMonth() + 1)}-${pad2(soldDate.getDate())}`
      : `${soldDate.getFullYear()}-${pad2(soldDate.getMonth() + 1)}`;

    const bucket = trendBuckets.get(bucketKey);
    if (bucket) {
      bucket.sales += saleRevenue;
      bucket.pv = Number((bucket.pv + salePv).toFixed(2));
      bucket.orders += 1;
      bucket.units += saleUnits;
      bucket.cost += saleCost;
      bucket.profit = bucket.sales - bucket.cost;
    }

    for (const line of netLines) {
      const categoryName = itemCategoryMap.get(line.itemId) || 'Chưa phân loại';
      const pEntry = productAgg.get(line.itemId) || {
        itemId: line.itemId,
        sku: line.sku,
        name: line.name,
        categoryName,
        units: 0,
        sales: 0,
        pv: 0,
        cost: 0,
        profit: 0,
      };
      pEntry.units += line.netQty;
      pEntry.sales += line.sales;
      pEntry.pv = Number((pEntry.pv + line.totalPv).toFixed(2));
      pEntry.cost += line.cost;
      pEntry.profit = pEntry.sales - pEntry.cost;
      productAgg.set(line.itemId, pEntry);

      const cEntry = categoryAgg.get(categoryName) || {
        categoryName,
        units: 0,
        sales: 0,
        pv: 0,
        cost: 0,
        profit: 0,
      };
      cEntry.units += line.netQty;
      cEntry.sales += line.sales;
      cEntry.pv = Number((cEntry.pv + line.totalPv).toFixed(2));
      cEntry.cost += line.cost;
      cEntry.profit = cEntry.sales - cEntry.cost;
      categoryAgg.set(categoryName, cEntry);
    }
  }

  const byProduct = [...productAgg.values()]
    .sort((a, b) => b.sales - a.sales || b.units - a.units)
    .map(entry => ({
      ...entry,
      salesPercent: totalSalesRevenue > 0 ? Number(((entry.sales / totalSalesRevenue) * 100).toFixed(1)) : 0,
      unitsPercent: totalSalesUnits > 0 ? Number(((entry.units / totalSalesUnits) * 100).toFixed(1)) : 0,
      pvPercent: totalSalesPv > 0 ? Number(((entry.pv / totalSalesPv) * 100).toFixed(1)) : 0,
    }));

  const byCategory = [...categoryAgg.values()]
    .sort((a, b) => b.sales - a.sales || b.units - a.units)
    .map(entry => ({
      ...entry,
      salesPercent: totalSalesRevenue > 0 ? Number(((entry.sales / totalSalesRevenue) * 100).toFixed(1)) : 0,
      unitsPercent: totalSalesUnits > 0 ? Number(((entry.units / totalSalesUnits) * 100).toFixed(1)) : 0,
      pvPercent: totalSalesPv > 0 ? Number(((entry.pv / totalSalesPv) * 100).toFixed(1)) : 0,
    }));

  const salesForTopCustomers = (topPeriodSales ?? periodSales) as any[];
  const topCustomersRaw = await aggregateCustomersFromSales(salesForTopCustomers);

  console.log('[InventoryReportService] Report generated successfully:', {
    ownerId,
    periodType: mainRange.periodType,
    rangeLabel: mainRange.label,
    totalValidOrders,
    totalSalesRevenue,
    totalSalesPv,
    productCount: byProduct.length,
    categoryCount: byCategory.length,
    topCustomerCount: topCustomersRaw.length,
  });

  return {
    range: {
      from: mainRange.from.toISOString(),
      to: mainRange.to.toISOString(),
      periodType: mainRange.periodType,
      granularity: mainRange.granularity,
      herbalifeFiscalYear: mainRange.herbalifeFiscalYear ?? resolveHerbalifeFiscalYear(now),
      label: mainRange.label,
    },
    stockSummary: {
      totalItems: stockItems.filter(i => !i.archived).length,
      totalAllItems: stockItems.length,
      totalUnits: totalStockUnits,
      totalCostValue: totalStockCostValue,
      totalPv: totalStockPv,
      lowStockCount,
      outOfStockCount,
      archivedCount,
      estimated: stockEstimated,
    },
    stockItems,
    salesSummary: {
      orders: totalValidOrders,
      units: totalSalesUnits,
      sales: totalSalesRevenue,
      pv: totalSalesPv,
      cost: totalSalesCost,
      profit: totalSalesRevenue - totalSalesCost,
    },
    trendSeries: [...trendBuckets.values()],
    breakdown: {
      byProduct,
      byCategory,
    },
    topCustomers: {
      rangeLabel: topRange.label,
      periodType: topRange.periodType,
      from: topRange.from.toISOString(),
      to: topRange.to.toISOString(),
      customers: topCustomersRaw,
    },
  };
};
