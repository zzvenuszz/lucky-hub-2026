import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { User } from '../models/User.ts';
import { NutritionGroup } from '../models/NutritionGroup.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { uploadImageToStorageProvider } from '../services/storage/imageStorageService.ts';
import { SystemSettings } from '../models/SystemSettings.ts';
import { InventoryCategory, InventoryItem, InventoryLot, InventoryMovement, PriceListVersion, Sale, SellerPrintPreference } from '../models/Inventory.ts';
import { buildInventoryAnalyticsReport } from '../services/inventoryReportService.ts';

const router = Router();
router.use(authMiddleware);
const inventory = requirePermission(RESOURCES.INVENTORY.MANAGE);
const inventorySeller = requirePermission([RESOURCES.INVENTORY.MANAGE, RESOURCES.INVENTORY.SELL]);
const inventoryOrPrice = requirePermission([RESOURCES.INVENTORY.MANAGE, RESOURCES.INVENTORY.SELL, RESOURCES.PRICELIST.MANAGE]);
const priceManager = requirePermission(RESOURCES.PRICELIST.MANAGE);
const levelManager = requirePermission(RESOURCES.MEMBER_LEVEL.MANAGE);
const anyLevelManager = requirePermission([RESOURCES.MEMBER_LEVEL.MANAGE, RESOURCES.MEMBER_LEVEL.MANAGE_ANY]);
const idOf = (req: Request) => (req as any).user.userId;
const memberPriceKey: Record<string, string> = { customer: 'price100', member: 'price25', senior_consultant: 'price35', success_builder: 'price42', supervisor: 'price50' };
const fixedPriceLabels: Record<string, string> = { price100: 'Giá Lẻ', price25: 'Giá -25%', price35: 'Giá -35%', price42: 'Giá -42%', price50: 'Giá -50%' };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safeMemberNumber = (value: any) => {
  const memberNumber = String(value || '').trim();
  return ['undefined', 'null'].includes(memberNumber.toLowerCase()) ? '' : memberNumber;
};
const logAudit = async (req: Request, type: string, details: string, targetId?: string, targetName?: string) => {
  const actor = (req as any).user;
  try { await new AuditLog({ actorId: actor.userId, actorName: actor.fullName, targetId, targetName, type, details, timestamp: new Date().toISOString() }).save(); }
  catch (error) { console.error('[Inventory] Audit log write failed:', error); }
};
const validDate = (value: any) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizeSkus = (value: any) => [...new Set((Array.isArray(value) ? value : [value]).flatMap((entry: any) => String(entry || '').split(/[\n,]/)).map((sku: string) => sku.trim().toUpperCase()).filter(Boolean))];
const skusForItem = (item: any) => normalizeSkus(item?.skus?.length ? item.skus : [item?.sku]);
const currentPrices = async (at: Date) => PriceListVersion.findOne({ effectiveFrom: { $lte: at }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }] }).sort({ effectiveFrom: -1 }).lean();
const reflowPriceListIntervals = async (versions: any[]) => {
  const ordered = [...versions].sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
  const operations: any[] = [];
  ordered.forEach((version, index) => {
    const next = ordered[index + 1];
    let effectiveTo = version.effectiveTo || null;
    let endDateExplicit = Boolean(version.endDateExplicit);
    if (next && (!endDateExplicit || (effectiveTo && new Date(effectiveTo).getTime() > new Date(next.effectiveFrom).getTime()))) {
      effectiveTo = next.effectiveFrom;
      endDateExplicit = false;
    } else if (!next && !endDateExplicit) effectiveTo = null;
    const oldEnd = version.effectiveTo ? new Date(version.effectiveTo).getTime() : null;
    const newEnd = effectiveTo ? new Date(effectiveTo).getTime() : null;
    if (oldEnd !== newEnd || Boolean(version.endDateExplicit) !== endDateExplicit) operations.push({ updateOne: { filter: { _id: version._id }, update: { $set: { effectiveTo, endDateExplicit } } } });
  });
  if (operations.length) await PriceListVersion.bulkWrite(operations);
};
const updateLivePriceListSkuEntries = async (sourceSkus: string[], targetSku?: string) => {
  const sourceSet = new Set(normalizeSkus(sourceSkus));
  const normalizedTarget = targetSku ? normalizeSkus([targetSku])[0] : '';
  if (!sourceSet.size) return { updatedVersions: 0, changedEntries: 0 };

  const now = new Date();
  const versions = await PriceListVersion.find({ $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }] })
    .select('_id entries')
    .lean() as any[];
  const operations: any[] = [];
  let changedEntries = 0;

  for (const version of versions) {
    const entries = Array.isArray(version.entries) ? version.entries : [];
    const sourceIndexes = entries
      .map((entry: any, index: number) => ({ entry, index, sku: String(entry.sku || '').trim().toUpperCase() }))
      .filter((item: any) => sourceSet.has(item.sku));
    if (!sourceIndexes.length) continue;

    const targetExists = Boolean(normalizedTarget && entries.some((entry: any) => String(entry.sku || '').trim().toUpperCase() === normalizedTarget));
    const replacementIndex = !targetExists && normalizedTarget
      ? (sourceIndexes.find((item: any) => item.sku === [...sourceSet][0]) || sourceIndexes[0]).index
      : -1;
    let replacementWritten = false;
    const nextEntries = entries.flatMap((entry: any, index: number) => {
      const sku = String(entry.sku || '').trim().toUpperCase();
      if (!sourceSet.has(sku)) return [entry];
      if (index === replacementIndex && !replacementWritten) {
        replacementWritten = true;
        return [{ ...entry, sku: normalizedTarget }];
      }
      return [];
    });

    changedEntries += sourceIndexes.length;
    operations.push({ updateOne: { filter: { _id: version._id }, update: { $set: { entries: nextEntries } } } });
  }

  if (operations.length) await PriceListVersion.bulkWrite(operations, { ordered: true });
  const result = { updatedVersions: operations.length, changedEntries };
  if (operations.length) {
    console.log('[Inventory] Live price list SKU entries updated:', {
      sourceSkus: [...sourceSet], targetSku: normalizedTarget || null, ...result,
    });
  }
  return result;
};
const invoiceNumber = (at: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${pad(at.getDate())}${pad(at.getMonth() + 1)}${at.getFullYear()}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `LK-${date}-${time}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
};
const netSaleTotals = (sale: any) => {
  const refunded = (sale.returnEvents || []).reduce((sum: number, event: any) => sum + Number(event.refundAmount || 0), 0);
  const returnedPv = (sale.returnedLines || []).reduce((sum: number, returned: any) => {
    const line = sale.lines.find((entry: any) => String(entry.itemId) === String(returned.itemId));
    return sum + Number(returned.quantity || 0) * Number(line?.pv || 0);
  }, 0);
  const units = sale.lines.reduce((sum: number, line: any) => sum + Number(line.quantity || 0), 0) - (sale.returnedLines || []).reduce((sum: number, returned: any) => sum + Number(returned.quantity || 0), 0);
  return { sales: Math.max(0, Number(sale.total || 0) - refunded), pv: Math.max(0, Number(sale.totalPv || 0) - returnedPv), units: Math.max(0, units) };
};

// Dedicated member lookup returns only the fields required at checkout.
router.get('/members', inventorySeller, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const safeQuery = escapeRegex(q);
    const members = await User.find({ status: 'ACTIVE', $or: [{ fullName: { $regex: safeQuery, $options: 'i' } }, { memberNumber: { $regex: safeQuery, $options: 'i' } }] })
      .select('_id fullName memberNumber memberLevel phoneNumber address').limit(15).lean();
    res.json(members.map((m: any) => ({ id: String(m._id), fullName: String(m.fullName || '').trim() || 'Hội viên', memberNumber: safeMemberNumber(m.memberNumber), memberLevel: m.memberLevel || 'customer', phoneNumber: String(m.phoneNumber || ''), address: String(m.address || '') })));
  } catch (error: any) { console.error('[Inventory] Member lookup failed:', error); res.status(500).json({ message: 'Không thể tìm hội viên.' }); }
});

const syncAndLoadPersonalItems = async (ownerId: string, canManageCatalog: boolean) => {
  const [prices, allSystemItems] = await Promise.all([
    currentPrices(new Date()),
    InventoryItem.find({})
      .select('_id ownerId sku skus name categoryId categoryName imageUrl pv lowStockThreshold archived quantity updatedAt')
      .sort({ updatedAt: -1 })
      .lean(),
  ]);
  const priceMap = new Map<string, any>(
    (prices?.entries || []).map((entry: any) => [String(entry.sku).trim().toUpperCase(), entry] as [string, any])
  );

  // Build master templates and stock totals across all users
  const templatesBySku = new Map<string, any>();
  const skuToPrimarySku = new Map<string, string>();
  const totalStockByPrimarySku = new Map<string, number>();
  const otherUsersStockByPrimarySku = new Map<string, number>();

  for (const rawItem of allSystemItems as any[]) {
    const itemSkus = skusForItem(rawItem);
    if (!itemSkus.length) continue;
    const matchedPrimary = itemSkus.map(s => skuToPrimarySku.get(s)).find(Boolean) || rawItem.sku;
    if (!templatesBySku.has(matchedPrimary)) {
      templatesBySku.set(matchedPrimary, {
        sku: matchedPrimary,
        skus: itemSkus,
        name: rawItem.name,
        categoryId: rawItem.categoryId || null,
        categoryName: rawItem.categoryName || '',
        imageUrl: rawItem.imageUrl || '',
        pv: Number(rawItem.pv || 0),
        lowStockThreshold: Number(rawItem.lowStockThreshold ?? 5),
        archived: Boolean(rawItem.archived),
      });
    } else {
      const existingTemplate = templatesBySku.get(matchedPrimary);
      existingTemplate.skus = normalizeSkus([...existingTemplate.skus, ...itemSkus]);
    }
    for (const s of templatesBySku.get(matchedPrimary).skus) {
      skuToPrimarySku.set(s, matchedPrimary);
    }
    const qty = Number(rawItem.quantity || 0);
    totalStockByPrimarySku.set(matchedPrimary, (totalStockByPrimarySku.get(matchedPrimary) || 0) + qty);
    if (String(rawItem.ownerId) !== String(ownerId)) {
      otherUsersStockByPrimarySku.set(matchedPrimary, (otherUsersStockByPrimarySku.get(matchedPrimary) || 0) + qty);
    }
  }

  // Ensure any SKU in the active price list that has no InventoryItem yet is also represented as a template
  for (const entry of (prices?.entries || []) as any[]) {
    const entrySku = String(entry.sku || '').trim().toUpperCase();
    if (!entrySku || skuToPrimarySku.has(entrySku)) continue;
    templatesBySku.set(entrySku, {
      sku: entrySku,
      skus: [entrySku],
      name: String(entry.name || entrySku).trim(),
      categoryId: null,
      categoryName: String(entry.categoryName || '').trim(),
      imageUrl: '',
      pv: Number(entry.pv || 0),
      lowStockThreshold: 5,
      archived: false,
    });
    skuToPrimarySku.set(entrySku, entrySku);
  }

  // Ensure personal InventoryItem records exist for this ownerId
  const personalItems = await InventoryItem.find({ ownerId }).lean() as any[];
  const personalBySku = new Map<string, any>();
  for (const item of personalItems) {
    for (const s of skusForItem(item)) personalBySku.set(s, item);
  }

  const newPersonalDocs: any[] = [];
  for (const [primarySku, template] of templatesBySku.entries()) {
    const hasPrice = template.skus.some((s: string) => priceMap.has(s));
    if (!canManageCatalog && !hasPrice) continue;
    const existingPersonal = template.skus.map((s: string) => personalBySku.get(s)).find(Boolean);
    if (!existingPersonal) {
      if (!canManageCatalog && template.archived) continue;
      newPersonalDocs.push({
        ownerId,
        sku: primarySku,
        skus: template.skus,
        name: template.name,
        categoryId: template.categoryId,
        categoryName: template.categoryName,
        imageUrl: template.imageUrl,
        pv: template.pv,
        quantity: 0,
        lowStockThreshold: template.lowStockThreshold ?? 5,
        archived: Boolean(template.archived),
      });
    }
  }

  if (newPersonalDocs.length) {
    try {
      await InventoryItem.insertMany(newPersonalDocs, { ordered: false });
      console.log('[Inventory] Personal catalog entries synchronized:', { ownerId, created: newPersonalDocs.length });
    } catch (error: any) {
      // unordered insert keeps successful documents and ignores duplicate-key races, as before.
      console.warn('[Inventory] Some personal catalog entries were not inserted:', {
        ownerId,
        requested: newPersonalDocs.length,
        inserted: error.insertedDocs?.length || 0,
        code: error.code,
      });
    }
  }

  const finalPersonalItems = await InventoryItem.find({ ownerId }).sort({ name: 1 }).lean() as any[];
  return finalPersonalItems
    .map((item: any) => {
      const itemSkus = skusForItem(item);
      const primarySku = skuToPrimarySku.get(item.sku) || item.sku;
      const priceEntry = priceMap.get(item.sku) || itemSkus.map(sku => priceMap.get(sku)).find(Boolean) || null;
      return {
        ...item,
        id: String(item._id),
        skus: itemSkus,
        prices: priceEntry,
        hasActivePrice: Boolean(priceEntry),
        totalSystemStock: totalStockByPrimarySku.get(primarySku) ?? Number(item.quantity || 0),
        otherUsersStock: otherUsersStockByPrimarySku.get(primarySku) ?? 0,
      };
    })
    .filter((item: any) => {
      if (canManageCatalog) return true;
      // Người bán chỉ dùng các mẫu sản phẩm có trong bảng giá đang có hiệu lực,
      // hoặc sản phẩm còn tồn kho trong kho riêng của họ (kể cả khi đã ngừng bán vẫn được bán tiếp đến khi tồn = 0)
      if (Number(item.quantity || 0) > 0) return true;
      return item.hasActivePrice && !item.archived;
    });
};

const personalItemsLoadInFlight = new Map<string, Promise<any[]>>();
const loadPersonalItems = async (ownerId: string, canManageCatalog: boolean) => {
  const key = `${ownerId}:${canManageCatalog ? 'catalog' : 'seller'}`;
  let pending = personalItemsLoadInFlight.get(key);
  if (!pending) {
    pending = syncAndLoadPersonalItems(ownerId, canManageCatalog);
    personalItemsLoadInFlight.set(key, pending);
  }
  try {
    return await pending;
  } finally {
    if (personalItemsLoadInFlight.get(key) === pending) personalItemsLoadInFlight.delete(key);
  }
};

router.get('/categories', inventoryOrPrice, async (_req: Request, res: Response) => {
  try {
    const allCategories = await InventoryCategory.find({}).sort({ name: 1 }).lean() as any[];
    const uniqueByName = new Map<string, any>();
    for (const cat of allCategories) {
      const key = String(cat.name || '').trim().toLowerCase();
      if (key && !uniqueByName.has(key)) uniqueByName.set(key, cat);
    }
    res.json([...uniqueByName.values()]);
  } catch (error: any) { console.error('[Inventory] Categories load failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/categories', priceManager, async (req: Request, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 80) return res.status(400).json({ message: 'Tên danh mục bắt buộc và tối đa 80 ký tự.' });
    const existing = await InventoryCategory.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }).lean();
    if (existing) return res.status(200).json(existing);
    const category = await InventoryCategory.create({ ownerId: idOf(req), name });
    console.log('[Inventory] Category created:', { ownerId: idOf(req), name });
    res.status(201).json(category);
  } catch (error: any) { console.error('[Inventory] Category create failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'Danh mục này đã tồn tại.' : error.message }); }
});

router.get('/items', inventoryOrPrice, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    const canManageCatalog = Boolean(req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE));
    const items = await loadPersonalItems(ownerId, canManageCatalog);
    res.json(items);
  } catch (error: any) { console.error('[Inventory] Items load failed:', error); res.status(500).json({ message: 'Không thể tải kho hàng.' }); }
});

router.post('/items', priceManager, async (req: Request, res: Response) => {
  try {
    const { name, imageUrl, pv, lowStockThreshold = 5 } = req.body;
    const skus = normalizeSkus(req.body.skus ?? req.body.sku);
    if (!skus.length || !String(name || '').trim() || !Number.isFinite(Number(pv)) || Number(pv) < 0) {
      return res.status(400).json({ message: 'SKU, tên sản phẩm hoặc điểm PV không hợp lệ.' });
    }
    const existingSku = await InventoryItem.findOne({ $or: [{ sku: { $in: skus } }, { skus: { $in: skus } }] }).select('sku').lean();
    if (existingSku) return res.status(409).json({ message: `SKU ${skus.find(sku => sku === existingSku.sku) || existingSku.sku} đã tồn tại trong danh mục mẫu sản phẩm.` });
    let finalImage = typeof imageUrl === 'string' ? imageUrl : '';
    if (finalImage.startsWith('data:image')) {
      const settings = await SystemSettings.findOne({}).select('storage').lean();
      const provider: any = settings?.storage?.providers?.find((p: any) => p.isActive);
      if (!provider) return res.status(400).json({ message: 'Chưa cấu hình dịch vụ lưu ảnh.' });
      finalImage = await uploadImageToStorageProvider(finalImage, provider, 'inventory');
    }
    let categoryId = null; let categoryName = '';
    if (req.body.categoryId) {
      const category = await InventoryCategory.findById(req.body.categoryId).select('name');
      if (!category) return res.status(400).json({ message: 'Danh mục không hợp lệ.' });
      categoryId = category._id; categoryName = category.name;
    }
    // Bước tạo sản phẩm chỉ tạo ra mẫu sản phẩm dùng chung với tồn kho = 0
    const item = await InventoryItem.create({
      ownerId: idOf(req),
      sku: skus[0],
      skus,
      name: String(name).trim(),
      categoryId,
      categoryName,
      imageUrl: finalImage,
      pv: Number(pv),
      quantity: 0,
      lowStockThreshold: Math.max(0, Number(lowStockThreshold) || 0),
    });
    console.log('[Inventory] Shared product template created:', { ownerId: idOf(req), skus, name: item.name });
    res.status(201).json({ ...item.toObject(), quantity: 0, id: String(item._id), totalSystemStock: 0, otherUsersStock: 0 });
  } catch (error: any) { console.error('[Inventory] Create item failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'SKU đã tồn tại trong danh mục.' : error.message || 'Không thể tạo mẫu sản phẩm.' }); }
});

router.put('/items/:id/threshold', inventorySeller, async (req: Request, res: Response) => {
  try {
    const threshold = Number(req.body.lowStockThreshold);
    if (!Number.isInteger(threshold) || threshold < 0) {
      return res.status(400).json({ message: 'Ngưỡng cảnh báo tồn kho phải là số nguyên không âm.' });
    }
    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, ownerId: idOf(req) },
      { $set: { lowStockThreshold: threshold } },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Không tìm thấy mặt hàng trong kho của bạn.' });
    console.log('[Inventory] Personal lowStockThreshold updated:', { ownerId: idOf(req), itemId: String(item._id), lowStockThreshold: threshold });
    res.json({ ...item.toObject(), id: String(item._id) });
  } catch (error: any) {
    console.error('[Inventory] Threshold update failed:', error);
    res.status(500).json({ message: error.message || 'Không thể cập nhật ngưỡng cảnh báo tồn.' });
  }
});

router.put('/items/:id', inventoryOrPrice, async (req: Request, res: Response) => {
  try {
    const actorId = idOf(req);
    const canManageCatalog = Boolean(req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE));
    const existing = await InventoryItem.findOne({ _id: req.params.id, ownerId: actorId }).lean() as any;
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy mặt hàng trong kho của bạn.' });

    const bodyKeys = Object.keys(req.body || {}).filter(k => req.body[k] !== undefined);
    const isThresholdOnly = bodyKeys.length === 1 && bodyKeys[0] === 'lowStockThreshold';

    if (isThresholdOnly) {
      const threshold = Math.max(0, Number(req.body.lowStockThreshold) || 0);
      const updated = await InventoryItem.findOneAndUpdate(
        { _id: existing._id, ownerId: actorId },
        { $set: { lowStockThreshold: threshold } },
        { new: true }
      );
      console.log('[Inventory] Personal lowStockThreshold updated via PUT /items/:id:', { ownerId: actorId, itemId: String(existing._id), threshold });
      return res.json(updated);
    }

    if (!canManageCatalog) {
      return res.status(403).json({ message: 'Chỉ người có quyền quản lý sản phẩm & bảng giá mới được sửa hoặc ngừng bán mẫu sản phẩm.' });
    }

    const existingSkus = skusForItem(existing);
    let removedPriceListSkus: string[] = [];
    const allMatchingItems = await InventoryItem.find({
      $or: [{ sku: { $in: existingSkus } }, { skus: { $in: existingSkus } }],
    }).lean() as any[];

    const otherUsersWithStock = allMatchingItems.filter(doc => String(doc.ownerId) !== String(actorId) && Number(doc.quantity || 0) > 0);
    const otherUsersStock = otherUsersWithStock.reduce((sum, doc) => sum + Number(doc.quantity || 0), 0);

    const isArchivingOnly = bodyKeys.length === 1 && bodyKeys[0] === 'archived';
    if (!isArchivingOnly && otherUsersStock > 0) {
      return res.status(409).json({
        message: `Không thể sửa mẫu sản phẩm vì đang có ${otherUsersWithStock.length} kho cá nhân của người dùng khác còn tồn kho (tổng ${otherUsersStock} sản phẩm).`,
      });
    }

    const templatePatch: any = {};
    for (const key of ['name', 'imageUrl', 'pv', 'archived']) {
      if (req.body[key] !== undefined) templatePatch[key] = req.body[key];
    }
    if (req.body.skus !== undefined || req.body.sku !== undefined) {
      const skus = normalizeSkus(req.body.skus ?? req.body.sku);
      if (!skus.length) return res.status(400).json({ message: 'Nhập ít nhất một SKU hợp lệ.' });
      removedPriceListSkus = existingSkus.filter(sku => !skus.includes(sku));
      const matchingIds = allMatchingItems.map(doc => doc._id);
      const conflict = await InventoryItem.findOne({
        _id: { $nin: matchingIds },
        $or: [{ sku: { $in: skus } }, { skus: { $in: skus } }],
      }).select('sku').lean();
      if (conflict) return res.status(409).json({ message: `SKU ${skus.find(sku => sku === conflict.sku) || conflict.sku} đã tồn tại ở sản phẩm khác.` });
      templatePatch.sku = skus[0];
      templatePatch.skus = skus;
    }
    if (req.body.categoryId !== undefined) {
      if (!req.body.categoryId) {
        templatePatch.categoryId = null;
        templatePatch.categoryName = '';
      } else {
        const category = await InventoryCategory.findById(req.body.categoryId).select('name');
        if (!category) return res.status(400).json({ message: 'Danh mục không hợp lệ.' });
        templatePatch.categoryId = category._id;
        templatePatch.categoryName = category.name;
      }
    }
    if (templatePatch.imageUrl?.startsWith('data:image')) {
      const settings = await SystemSettings.findOne({}).select('storage').lean();
      const provider: any = settings?.storage?.providers?.find((p: any) => p.isActive);
      if (!provider) return res.status(400).json({ message: 'Chưa cấu hình dịch vụ lưu ảnh.' });
      templatePatch.imageUrl = await uploadImageToStorageProvider(templatePatch.imageUrl, provider, 'inventory');
    }

    // Đồng bộ mẫu sản phẩm cho tất cả các kho cá nhân, nhưng giữ nguyên tồn kho và ngưỡng cảnh báo riêng của từng người
    const matchingIds = allMatchingItems.map(doc => doc._id);
    if (Object.keys(templatePatch).length > 0) {
      await InventoryItem.updateMany({ _id: { $in: matchingIds } }, { $set: templatePatch });
    }
    if (removedPriceListSkus.length && templatePatch.sku) {
      await updateLivePriceListSkuEntries(removedPriceListSkus, templatePatch.sku);
    }
    if (req.body.lowStockThreshold !== undefined) {
      await InventoryItem.updateOne(
        { _id: existing._id, ownerId: actorId },
        { $set: { lowStockThreshold: Math.max(0, Number(req.body.lowStockThreshold) || 0) } }
      );
    }

    const item = await InventoryItem.findById(existing._id);
    console.log('[Inventory] Product template updated across system:', { actorId, itemId: String(existing._id), updatedDocs: matchingIds.length, archived: item?.archived, remappedPriceListSkus: removedPriceListSkus.length });
    res.json(item);
  } catch (error: any) { console.error('[Inventory] Update item failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'SKU đã tồn tại trong kho.' : error.message }); }
});

router.delete('/items/:id', priceManager, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    const existing = await InventoryItem.findOne({ _id: req.params.id, ownerId }).lean() as any;
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy mặt hàng.' });

    const existingSkus = skusForItem(existing);
    const allMatchingItems = await InventoryItem.find({
      $or: [{ sku: { $in: existingSkus } }, { skus: { $in: existingSkus } }],
    }).lean() as any[];
    const matchingIds = allMatchingItems.map(doc => doc._id);

    const totalSystemStock = allMatchingItems.reduce((sum, doc) => sum + Number(doc.quantity || 0), 0);
    if (totalSystemStock > 0) {
      return res.status(409).json({
        message: `Không thể xóa sản phẩm vì tổng tồn kho hiện tại của tất cả người dùng là ${totalSystemStock} sản phẩm. Chỉ cho phép xóa khi tồn kho của tất cả mọi người cho sản phẩm đó = 0.`,
      });
    }

    const hasSales = await Sale.exists({
      $or: [
        { 'lines.itemId': { $in: matchingIds } },
        { 'lines.sku': { $in: existingSkus } },
      ],
    });
    if (hasSales) {
      return res.status(409).json({ message: 'Mặt hàng đã có trên hóa đơn nên không thể xóa hẳn. Hãy dùng “Ngừng bán” để giữ nguyên lịch sử.' });
    }

    await updateLivePriceListSkuEntries(existingSkus);
    await Promise.all([
      InventoryLot.deleteMany({ itemId: { $in: matchingIds } }),
      InventoryMovement.deleteMany({ itemId: { $in: matchingIds } }),
      InventoryItem.deleteMany({ _id: { $in: matchingIds } }),
    ]);
    await logAudit(req, 'INVENTORY_ITEM_DELETE', `Xóa hẳn mẫu sản phẩm ${existing.sku} · ${existing.name}`, String(existing._id), existing.name);
    console.log('[Inventory] Product template permanently deleted:', { ownerId, sku: existing.sku, deletedDocs: matchingIds.length });
    res.json({ success: true, id: String(existing._id) });
  } catch (error: any) {
    console.error('[Inventory] Product delete failed:', error);
    res.status(500).json({ message: error.message || 'Không thể xóa sản phẩm.' });
  }
});

router.post('/items/:id/receive', inventorySeller, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    const quantity = Number(req.body.quantity);
    const at = validDate(req.body.receivedAt);
    if (!Number.isInteger(quantity) || quantity <= 0 || !at) {
      return res.status(400).json({ message: 'Số lượng hoặc ngày nhập không hợp lệ.' });
    }
    const item = await InventoryItem.findOne({ _id: req.params.id, ownerId });
    if (!item) return res.status(404).json({ message: 'Không tìm thấy mặt hàng trong kho của bạn.' });
    if (item.archived) {
      return res.status(400).json({ message: `Sản phẩm ${item.name} đã ngừng bán, không cho phép nhập thêm hàng.` });
    }
    const activePriceList = await currentPrices(new Date());
    const itemSkus = skusForItem(item);
    const priceEntry = (activePriceList?.entries || []).find((entry: any) => itemSkus.includes(String(entry.sku).toUpperCase()));
    if (!priceEntry) {
      return res.status(400).json({ message: `Sản phẩm ${item.name} (${item.sku}) chưa có trong bảng giá đang có hiệu lực.` });
    }
    const unitCost = req.body.unitCost !== undefined && Number(req.body.unitCost) > 0
      ? Number(req.body.unitCost)
      : Number(priceEntry.costReference || priceEntry.price50 || 0);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return res.status(400).json({ message: 'Giá vốn không hợp lệ.' });
    }
    const lot = await InventoryLot.create({
      ownerId,
      itemId: item._id,
      receivedQuantity: quantity,
      remainingQuantity: quantity,
      unitCost,
      priceListVersionId: activePriceList?._id || null,
      receivedAt: at,
    });
    await InventoryItem.updateOne({ _id: item._id, ownerId }, { $inc: { quantity } });
    await InventoryMovement.create({
      ownerId,
      itemId: item._id,
      lotId: lot._id,
      type: 'receive',
      quantityDelta: quantity,
      unitCost,
      receivedAt: at,
      actorId: ownerId,
      reason: String(req.body.reason || 'Nhập kho'),
    });
    console.log('[Inventory] Stock received:', { ownerId, sku: item.sku, quantity, unitCost, receivedAt: at.toISOString() });
    res.status(201).json({ lot, quantity: item.quantity + quantity });
  } catch (error: any) { console.error('[Inventory] Receive stock failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/receive-batch', inventorySeller, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    const receivedAt = validDate(req.body.receivedAt);
    const reason = String(req.body.reason || '').trim() || 'Nhập kho theo danh sách';
    const rawLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!receivedAt || !rawLines.length) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất một sản phẩm và ngày nhập hợp lệ.' });
    }

    const canManageCatalog = Boolean(req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE));
    await loadPersonalItems(ownerId, canManageCatalog);

    const activePriceList = await currentPrices(new Date());
    if (!activePriceList?.entries?.length) {
      return res.status(400).json({ message: 'Chưa có bảng giá đang có hiệu lực để nhập hàng.' });
    }
    const priceMap = new Map<string, any>(
      (activePriceList.entries || []).map((entry: any) => [String(entry.sku).trim().toUpperCase(), entry] as [string, any])
    );

    const validatedLines: Array<{ item: any; quantity: number; unitCost: number; sku: string }> = [];
    for (const line of rawLines) {
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'Số lượng nhập của từng sản phẩm phải là số nguyên lớn hơn 0.' });
      }
      const requestedSku = String(line.sku || '').trim().toUpperCase();
      const personalItem = line.itemId
        ? await InventoryItem.findOne({ _id: line.itemId, ownerId })
        : await InventoryItem.findOne({ ownerId, $or: [{ sku: requestedSku }, { skus: requestedSku }] });

      if (!personalItem) {
        return res.status(404).json({ message: `Không tìm thấy mẫu sản phẩm ${requestedSku || ''} trong danh mục.` });
      }
      if (personalItem.archived) {
        return res.status(400).json({ message: `Sản phẩm ${personalItem.name} (${personalItem.sku}) đã ngừng bán, không cho phép nhập thêm hàng.` });
      }
      const itemSkus = skusForItem(personalItem);
      const priceEntry = priceMap.get(requestedSku) || priceMap.get(personalItem.sku) || itemSkus.map(s => priceMap.get(s)).find(Boolean);
      if (!priceEntry) {
        return res.status(400).json({ message: `Sản phẩm ${personalItem.name} (${personalItem.sku}) chưa có trong bảng giá đang có hiệu lực.` });
      }
      const unitCost = line.unitCost !== undefined && Number(line.unitCost) >= 0 && String(line.unitCost) !== ''
        ? Number(line.unitCost)
        : Number(priceEntry.costReference || priceEntry.price50 || 0);
      validatedLines.push({ item: personalItem, quantity, unitCost, sku: requestedSku || personalItem.sku });
    }

    const createdMovements: any[] = [];
    for (const entry of validatedLines) {
      const lot = await InventoryLot.create({
        ownerId,
        itemId: entry.item._id,
        receivedQuantity: entry.quantity,
        remainingQuantity: entry.quantity,
        unitCost: entry.unitCost,
        priceListVersionId: activePriceList._id || null,
        receivedAt,
      });
      await InventoryItem.updateOne({ _id: entry.item._id, ownerId }, { $inc: { quantity: entry.quantity } });
      const movement = await InventoryMovement.create({
        ownerId,
        itemId: entry.item._id,
        lotId: lot._id,
        type: 'receive',
        quantityDelta: entry.quantity,
        unitCost: entry.unitCost,
        receivedAt,
        actorId: ownerId,
        reason: `${reason} (Ngày nhập: ${receivedAt.toLocaleDateString('vi-VN')})`,
      });
      createdMovements.push(movement);
    }

    const totalQuantity = validatedLines.reduce((sum, l) => sum + l.quantity, 0);
    await logAudit(
      req,
      'INVENTORY_BATCH_RECEIVE',
      `Nhập kho ${validatedLines.length} mặt hàng (tổng ${totalQuantity} SP), ngày nhập ${receivedAt.toLocaleDateString('vi-VN')}: ${validatedLines.map(l => `${l.sku} × ${l.quantity}`).join(', ')}`
    );
    console.log('[Inventory] Batch stock received:', {
      ownerId,
      linesCount: validatedLines.length,
      totalQuantity,
      receivedAt: receivedAt.toISOString(),
    });
    res.status(201).json({
      success: true,
      receivedCount: validatedLines.length,
      totalQuantity,
      receivedAt: receivedAt.toISOString(),
      movements: createdMovements,
    });
  } catch (error: any) {
    console.error('[Inventory] Batch receive failed:', error);
    res.status(500).json({ message: error.message || 'Không thể nhập kho.' });
  }
});

router.post('/items/:id/adjust', inventorySeller, async (req: Request, res: Response) => {
  try {
    const delta = Number(req.body.quantityDelta); const reason = String(req.body.reason || '').trim();
    if (!Number.isInteger(delta) || delta === 0 || !reason) return res.status(400).json({ message: 'Nhập số lượng điều chỉnh và lý do.' });
    const filter: any = { _id: req.params.id, ownerId: idOf(req), quantity: { $gte: Math.max(0, -delta) } };
    if (delta > 0) filter.archived = false;
    const item = await InventoryItem.findOneAndUpdate(filter, { $inc: { quantity: delta } }, { new: true });
    if (!item) return res.status(400).json({ message: 'Không tìm thấy mặt hàng hoặc điều chỉnh sẽ làm tồn kho âm.' });
    let unitCost = Number(req.body.unitCost || 0);
    if (delta > 0) {
      if (!Number.isFinite(unitCost) || unitCost < 0) { await InventoryItem.updateOne({ _id: item._id, ownerId: idOf(req) }, { $inc: { quantity: -delta } }); return res.status(400).json({ message: 'Giá vốn không hợp lệ.' }); }
      await InventoryLot.create({ ownerId: idOf(req), itemId: item._id, receivedQuantity: delta, remainingQuantity: delta, unitCost, receivedAt: new Date() });
    } else {
      let needed = -delta; let totalCost = 0; const deductedLots: Array<{ id: any; quantity: number }> = [];
      const lots = await InventoryLot.find({ ownerId: idOf(req), itemId: item._id, remainingQuantity: { $gt: 0 } }).sort({ receivedAt: 1 });
      for (const lot of lots) {
        if (!needed) break;
        const take = Math.min(needed, lot.remainingQuantity);
        const updated = await InventoryLot.findOneAndUpdate({ _id: lot._id, ownerId: idOf(req), remainingQuantity: { $gte: take } }, { $inc: { remainingQuantity: -take } });
        if (updated) { needed -= take; totalCost += take * lot.unitCost; deductedLots.push({ id: lot._id, quantity: take }); }
      }
      if (needed) {
        await InventoryItem.updateOne({ _id: item._id, ownerId: idOf(req) }, { $inc: { quantity: -delta } });
        for (const lot of deductedLots) await InventoryLot.updateOne({ _id: lot.id }, { $inc: { remainingQuantity: lot.quantity } });
        return res.status(400).json({ message: 'Không đủ dữ liệu lô giá vốn để điều chỉnh tồn.' });
      }
      unitCost = totalCost / -delta;
    }
    await InventoryMovement.create({ ownerId: idOf(req), itemId: item._id, type: 'adjustment', quantityDelta: delta, unitCost, actorId: idOf(req), reason });
    res.json(item);
  } catch (error: any) { console.error('[Inventory] Adjustment failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/movements', inventorySeller, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const movements = await InventoryMovement.find({ ownerId: idOf(req) }).populate('itemId', 'sku skus name').sort({ createdAt: -1 }).limit(limit).lean();
    res.json(movements);
  } catch (error: any) { console.error('[Inventory] Movement history failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/price-list', async (req: Request, res: Response) => {
  try {
    if (!req.user?.permissions.includes(RESOURCES.INVENTORY.MANAGE) && !req.user?.permissions.includes(RESOURCES.INVENTORY.SELL) && !req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE)) return res.status(403).json({ message: 'Bạn không có quyền xem bảng giá.' });
    const at = validDate(req.query.at) || new Date();
    const versionsQuery = PriceListVersion.find().sort({ effectiveFrom: -1 });
    if (!req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE)) versionsQuery.limit(1);
    const versions = await versionsQuery.lean();
    const active = await currentPrices(at);
    res.json({ active, versions });
  } catch (error: any) { console.error('[Inventory] Price list load failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/price-list/products', priceManager, async (_req: Request, res: Response) => {
  try {
    const [items, active] = await Promise.all([
      InventoryItem.find({ archived: { $ne: true } }).select('sku skus name imageUrl pv categoryName -_id').sort({ name: 1 }).lean(),
      currentPrices(new Date()),
    ]);
    const priceMap = new Map<string, any>((active?.entries || []).map((entry: any) => [String(entry.sku), entry] as [string, any]));
    const products = new Map<string, any>();
    for (const item of items as any[]) {
      const itemSkus = skusForItem(item);
      const existingProduct = products.get(item.sku);
      if (existingProduct) existingProduct.skus = normalizeSkus([...existingProduct.skus, ...itemSkus]);
      else products.set(item.sku, { sku: item.sku, skus: itemSkus, name: item.name, imageUrl: item.imageUrl, pv: item.pv, categoryName: item.categoryName, prices: priceMap.get(item.sku) || itemSkus.map(sku => priceMap.get(sku)).find(Boolean) || null });
    }
    const claimedSkus = new Set<string>();
    const catalog = [...products.values()].filter(product => !claimedSkus.has(product.sku)).flatMap(product => {
      const availableSkus = product.skus.filter((sku: string) => !claimedSkus.has(sku));
      if (!availableSkus.includes(product.sku)) return [];
      availableSkus.forEach((sku: string) => claimedSkus.add(sku));
      return [{ ...product, skus: availableSkus }];
    });
    console.log('[Inventory] Price list products loaded:', { count: products.size });
    res.json(catalog);
  } catch (error: any) { console.error('[Inventory] Price list products load failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/price-list', priceManager, async (req: Request, res: Response) => {
  try {
    const effectiveFrom = validDate(req.body.effectiveFrom);
    const requestedEndValue = req.body.effectiveTo;
    const requestedEffectiveTo = requestedEndValue ? validDate(requestedEndValue) : null;
    const entries = Array.isArray(req.body.entries) ? req.body.entries.map((entry: any) => ({ sku: String(entry.sku || '').trim().toUpperCase(), name: String(entry.name || '').trim(), pv: Number(entry.pv || 0), categoryName: String(entry.categoryName || '').trim(), costReference: Number(entry.costReference || 0), price100: Number(entry.price100), price25: Number(entry.price25), price35: Number(entry.price35), price42: Number(entry.price42), price50: Number(entry.price50) })) : [];
    const uniqueSkus = new Set(entries.map((entry: any) => entry.sku));
    if (!effectiveFrom || (requestedEndValue && !requestedEffectiveTo) || (requestedEffectiveTo && requestedEffectiveTo <= effectiveFrom) || !entries.length || uniqueSkus.size !== entries.length || entries.some((e: any) => !e.sku || ['costReference', 'price100', 'price25', 'price35', 'price42', 'price50'].some(key => !Number.isSafeInteger(e[key]) || e[key] < 0))) return res.status(400).json({ message: 'Ngày hiệu lực hoặc dữ liệu giá không hợp lệ; ngày kết thúc phải sau ngày bắt đầu, SKU phải duy nhất và giá phải là số nguyên không âm.' });
    const conflict = await PriceListVersion.findOne({ effectiveFrom: { $lt: effectiveFrom }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: effectiveFrom } }] }).sort({ effectiveFrom: -1 });
    const next = await PriceListVersion.findOne({ effectiveFrom: { $gt: effectiveFrom } }).sort({ effectiveFrom: 1 });
    if (requestedEffectiveTo && next && requestedEffectiveTo > next.effectiveFrom) return res.status(400).json({ message: `Ngày kết thúc phải trước bảng giá kế tiếp có hiệu lực từ ${next.effectiveFrom.toLocaleDateString('vi-VN')}.` });
    if (conflict) { conflict.effectiveTo = effectiveFrom; conflict.endDateExplicit = false; }
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ message: 'Tên bảng giá bắt buộc và tối đa 100 ký tự.' });
    const effectiveTo = requestedEffectiveTo || next?.effectiveFrom || null;
    const doc = await PriceListVersion.create({ name, effectiveFrom, effectiveTo, endDateExplicit: Boolean(requestedEffectiveTo), entries, createdBy: idOf(req), note: String(req.body.note || '') });
    await conflict?.save();
    await logAudit(req, 'PRICELIST_UPDATE', `Tạo bảng giá “${name}” hiệu lực từ ${effectiveFrom.toISOString()}${effectiveTo ? ` đến trước ${effectiveTo.toISOString()}` : ' không có ngày kết thúc'}`);
    console.log('[Inventory] Price list version created:', { id: doc.id, effectiveFrom, effectiveTo, previousVersionClosed: Boolean(conflict) });
    res.status(201).json(doc);
  } catch (error: any) { console.error('[Inventory] Price list update failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'Đã tồn tại bảng giá tại thời điểm này.' : error.message }); }
});

router.put('/price-list/:id', priceManager, async (req: Request, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const effectiveFrom = validDate(req.body.effectiveFrom);
    const endValue = req.body.effectiveTo;
    const explicitEnd = endValue ? validDate(endValue) : null;
    if (!name || name.length > 100 || !effectiveFrom || (endValue && !explicitEnd) || (explicitEnd && explicitEnd <= effectiveFrom)) return res.status(400).json({ message: 'Tên hoặc khoảng ngày hiệu lực không hợp lệ.' });
    const current = await PriceListVersion.findById(req.params.id).lean();
    if (!current) return res.status(404).json({ message: 'Không tìm thấy bảng giá.' });
    const others = await PriceListVersion.find({ _id: { $ne: current._id } }).lean();
    if (others.some(version => new Date(version.effectiveFrom).getTime() === effectiveFrom.getTime())) return res.status(409).json({ message: 'Đã có bảng giá khác bắt đầu vào ngày này.' });
    const updated = { ...current, name, effectiveFrom, effectiveTo: explicitEnd, endDateExplicit: Boolean(explicitEnd) };
    const versions = [...others, updated].sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
    const targetIndex = versions.findIndex(version => String(version._id) === String(current._id));
    const next = versions[targetIndex + 1];
    if (explicitEnd && next && explicitEnd > new Date(next.effectiveFrom)) return res.status(400).json({ message: `Ngày kết thúc phải trước bảng giá kế tiếp có hiệu lực từ ${new Date(next.effectiveFrom).toLocaleDateString('vi-VN')}.` });
    await PriceListVersion.updateOne({ _id: current._id }, { $set: { name, effectiveFrom, effectiveTo: explicitEnd, endDateExplicit: Boolean(explicitEnd) } });
    await reflowPriceListIntervals(versions);
    const saved = await PriceListVersion.findById(req.params.id).lean();
    await logAudit(req, 'PRICELIST_UPDATE', `Sửa bảng giá “${name}” hiệu lực từ ${effectiveFrom.toISOString()}`);
    console.log('[Inventory] Price list metadata updated:', { id: req.params.id, effectiveFrom, effectiveTo: saved?.effectiveTo });
    res.json(saved);
  } catch (error: any) { console.error('[Inventory] Price list metadata update failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'Đã tồn tại bảng giá tại thời điểm này.' : error.message }); }
});

router.delete('/price-list/:id', priceManager, async (req: Request, res: Response) => {
  try {
    const version = await PriceListVersion.findById(req.params.id).lean();
    if (!version) return res.status(404).json({ message: 'Không tìm thấy bảng giá.' });
    const saleReference = await Sale.exists({ 'lines.priceListVersionId': version._id });
    if (saleReference) return res.status(409).json({ message: 'Không thể xóa bảng giá đang được hóa đơn tham chiếu. Hãy hủy và xóa các hóa đơn đã hủy liên quan trước.' });
    await InventoryLot.updateMany({ priceListVersionId: version._id }, { $set: { priceListVersionId: null } });
    await PriceListVersion.deleteOne({ _id: version._id });
    const remaining = await PriceListVersion.find().sort({ effectiveFrom: 1 }).lean();
    await reflowPriceListIntervals(remaining);
    await logAudit(req, 'PRICELIST_DELETE', `Xóa bảng giá “${version.name}”`);
    console.log('[Inventory] Price list version deleted:', { id: req.params.id, name: version.name });
    res.json({ success: true, id: req.params.id });
  } catch (error: any) { console.error('[Inventory] Price list delete failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/members/downline', anyLevelManager, async (req: Request, res: Response) => {
  try {
    const all = await User.find({ status: 'ACTIVE' }).select('_id fullName memberNumber memberLevel sponsorUserId').lean() as any[];
    const children = new Map<string, any[]>();
    for (const user of all) { const parent = String(user.sponsorUserId || ''); if (!children.has(parent)) children.set(parent, []); children.get(parent)!.push(user); }
    const hasGlobalLevelPermission = req.user!.permissions.includes(RESOURCES.MEMBER_LEVEL.MANAGE_ANY);
    const result: any[] = []; const queue = hasGlobalLevelPermission ? [...all] : [...(children.get(String(idOf(req))) || [])]; const seen = new Set<string>();
    while (queue.length) { const user = queue.shift(); const id = String(user._id); if (seen.has(id)) continue; seen.add(id); result.push({ id, fullName: user.fullName, memberNumber: user.memberNumber, memberLevel: user.memberLevel }); queue.push(...(children.get(id) || [])); }
    res.json(result);
  } catch (error: any) { console.error('[Inventory] Downline lookup failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/members/:id/purchases', inventorySeller, async (req: Request, res: Response) => {
  try {
    const member = await User.findById(req.params.id).select('_id fullName memberNumber').lean();
    if (!member) return res.status(404).json({ message: 'Không tìm thấy hội viên.' });
    const sales = await Sale.find({ ownerId: idOf(req), buyerUserId: req.params.id }).sort({ soldAt: -1 }).limit(500).lean();
    res.json({ member, sales });
  } catch (error: any) { console.error('[Inventory] Member purchases failed:', error); res.status(500).json({ message: error.message }); }
});

router.put('/members/:id/level', anyLevelManager, async (req: Request, res: Response) => {
  try {
    const target = await User.findById(req.params.id).select('fullName memberLevel sponsorUserId memberNumber');
    if (!target) return res.status(404).json({ message: 'Không tìm thấy hội viên.' });
    const hasGlobalLevelPermission = req.user!.permissions.includes(RESOURCES.MEMBER_LEVEL.MANAGE_ANY);
    console.log('[Inventory] Member level update started:', { actorId: String(idOf(req)), targetId: String(target._id), hasGlobalLevelPermission, requestedLevel: req.body.memberLevel });
    if (!hasGlobalLevelPermission) {
      let cursor: any = target; let isDownline = false; const visited = new Set<string>();
      while (cursor?.sponsorUserId) {
        const sponsorId = String(cursor.sponsorUserId);
        if (sponsorId === String(idOf(req))) { isDownline = true; break; }
        if (visited.has(sponsorId)) return res.status(409).json({ message: 'Phát hiện vòng lặp trong quan hệ bảo trợ.' });
        visited.add(sponsorId); cursor = await User.findById(sponsorId).select('sponsorUserId').lean();
      }
      if (!isDownline) return res.status(403).json({ message: 'Chỉ được đổi cấp độ thành viên trong tuyến dưới của bạn.' });
    }
    const levels = ['customer', 'member', 'senior_consultant', 'success_builder', 'supervisor'];
    if (!levels.includes(req.body.memberLevel)) return res.status(400).json({ message: 'Cấp độ không hợp lệ.' });
    if (req.body.memberLevel !== 'customer' && !target.memberNumber) return res.status(400).json({ message: 'Hội viên cần có mã hội viên trước khi gán cấp độ này.' });
    const previous = target.memberLevel; target.memberLevel = req.body.memberLevel; await target.save();
    await logAudit(req, 'MEMBER_LEVEL_UPDATE', `Cấp độ ${previous} → ${target.memberLevel}; lý do: ${String(req.body.reason || 'Không ghi lý do')}`, String(target._id), target.fullName);
    console.log('[Inventory] Member level update completed:', { actorId: String(idOf(req)), targetId: String(target._id), previousLevel: previous, memberLevel: target.memberLevel });
    res.json({ id: String(target._id), memberLevel: target.memberLevel });
  } catch (error: any) { console.error('[Inventory] Member level update failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/sales', inventorySeller, async (req: Request, res: Response) => {
  try {
    const query: any = { ownerId: idOf(req) };
    if (req.query.from || req.query.to) query.soldAt = { ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}), ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}) };
    if (req.query.buyerUserId) query.buyerUserId = req.query.buyerUserId;
    const page = Math.max(1, Number(req.query.page || 1)); const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const [sales, total] = await Promise.all([Sale.find(query).sort({ soldAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Sale.countDocuments(query)]);
    res.json({ sales, total, page, limit });
  } catch (error: any) { console.error('[Inventory] Sales load failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/sales/:id', inventorySeller, async (req: Request, res: Response) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, ownerId: idOf(req) }).lean();
    if (!sale) return res.status(404).json({ message: 'Không tìm thấy hoá đơn trong lịch sử của bạn.' });
    res.json(sale);
  } catch (error: any) { console.error('[Inventory] Invoice lookup failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/sales', inventorySeller, async (req: Request, res: Response) => {
  const ownerId = idOf(req); const soldAt = validDate(req.body.soldAt);
  const rollback: Array<{ itemId: any; quantity: number; lots: Array<{ lotId: any; quantity: number }> }> = [];
  let createdSaleId: any = null;
  try {
    if (!soldAt || !Array.isArray(req.body.lines) || !req.body.lines.length) return res.status(400).json({ message: 'Đơn hàng hoặc thời gian bán không hợp lệ.' });
    const seller = await User.findById(ownerId).select('fullName address phoneNumber').lean() as any;
    if (!String(seller?.fullName || '').trim() || !String(seller?.phoneNumber || '').trim()) {
      console.warn('[Inventory] Sale blocked: seller profile is missing name or phone.', { ownerId });
      return res.status(400).json({ message: 'Hãy cập nhật họ tên và số điện thoại trong hồ sơ người bán trước khi bán hàng.' });
    }
    let sellerAddress = String(seller.address || '').trim(); let sellerAddressGroupId: any = null;
    if (req.body.sellerAddressGroupId) {
      const operatingGroup = await NutritionGroup.findOne({ _id: req.body.sellerAddressGroupId, isActive: true, $or: [{ ownerId }, { coOwners: ownerId }] }).select('_id address').lean() as any;
      if (!operatingGroup || !String(operatingGroup.address || '').trim()) return res.status(400).json({ message: 'Bạn không vận hành NDD đã chọn hoặc NDD chưa có địa chỉ.' });
      sellerAddress = String(operatingGroup.address).trim(); sellerAddressGroupId = operatingGroup._id;
    }
    if (!sellerAddress) return res.status(400).json({ message: 'Hãy cập nhật địa chỉ trong hồ sơ hoặc chọn địa chỉ NDD do bạn vận hành.' });
    const buyerType = req.body.buyerType;
    let buyer = { userId: null as any, name: String(req.body.buyerName || '').trim(), memberNumber: '' };
    let buyerAddress = String(req.body.buyerAddress || '').trim();
    let buyerPhone = String(req.body.buyerPhone || '').trim();
    let level = 'customer';
    if (buyerType === 'member') {
      const member = await User.findOne({ _id: req.body.buyerUserId, status: 'ACTIVE' }).select('_id fullName memberNumber memberLevel phoneNumber address');
      if (!member) return res.status(400).json({ message: 'Không tìm thấy hồ sơ người mua đang hoạt động.' });
      buyer = { userId: member._id, name: String(member.fullName || '').trim() || 'Hội viên', memberNumber: safeMemberNumber(member.memberNumber) }; level = member.memberLevel || 'customer';
      buyerAddress = buyerAddress || String(member.address || '').trim();
      buyerPhone = buyerPhone || String(member.phoneNumber || '').trim();
    } else if (!['walk-in', 'custom'].includes(buyerType) || (buyerType === 'custom' && !buyer.name)) return res.status(400).json({ message: 'Thông tin người mua không hợp lệ.' });
    if (buyerType === 'walk-in') buyer.name = 'Khách lẻ';
    if (!buyerAddress || !buyerPhone) return res.status(400).json({ message: 'Cần nhập đầy đủ địa chỉ và số điện thoại người mua.' });
    const priceList: any = await currentPrices(soldAt);
    if (!priceList) return res.status(400).json({ message: 'Chưa có bảng giá hiệu lực tại thời điểm bán.' });
    const defaultPriceField = memberPriceKey[level] || 'price100';
    const lines: any[] = [];
    for (const input of req.body.lines) {
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Số lượng mặt hàng không hợp lệ.');
      const item: any = await InventoryItem.findOne({ _id: input.itemId, ownerId }).lean();
      if (!item) throw new Error('Mặt hàng không thuộc kho của bạn.');
      const acceptedSkus = skusForItem(item);
      const requestedSku = String(input.sku || item.sku).trim().toUpperCase();
      if (!acceptedSkus.includes(requestedSku)) throw new Error(`SKU ${requestedSku} không thuộc sản phẩm ${item.name}.`);
      const priceEntry: any = priceList.entries.find((entry: any) => entry.sku === requestedSku) || priceList.entries.find((entry: any) => entry.sku === item.sku) || acceptedSkus.map(sku => priceList.entries.find((entry: any) => entry.sku === sku)).find(Boolean);
      if (!priceEntry) throw new Error(`SKU ${item.sku} chưa có trong bảng giá.`);
      const priceField = input.priceField === undefined ? defaultPriceField : String(input.priceField);
      if (!Object.prototype.hasOwnProperty.call(fixedPriceLabels, priceField)) throw new Error('Mức giá bán không hợp lệ.');
      const defaultUnitPrice = Number(priceEntry[defaultPriceField]);
      const unitPrice = Number(priceEntry[priceField]);
      if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new Error('Đơn giá phải là số nguyên không âm.');
      const updated = await InventoryItem.findOneAndUpdate({ _id: item._id, ownerId, quantity: { $gte: quantity } }, { $inc: { quantity: -quantity } }, { new: true });
      if (!updated) throw new Error(`Tồn kho không đủ cho ${item.name}.`);
      let needed = quantity; const lots = await InventoryLot.find({ ownerId, itemId: item._id, remainingQuantity: { $gt: 0 } }).sort({ receivedAt: 1 });
      let cost = 0; const deductions: any[] = [];
      const rollbackEntry = { itemId: item._id, quantity, lots: deductions };
      rollback.push(rollbackEntry);
      for (const lot of lots) {
        if (!needed) break;
        const take = Math.min(needed, lot.remainingQuantity);
        const deducted = await InventoryLot.findOneAndUpdate({ _id: lot._id, ownerId, remainingQuantity: { $gte: take } }, { $inc: { remainingQuantity: -take } }, { new: true });
        if (!deducted) throw new Error(`Lô giá vốn của ${item.name} vừa được cập nhật; hãy thử lại.`);
        needed -= take; cost += take * lot.unitCost; deductions.push({ lotId: lot._id, quantity: take });
      }
      if (needed > 0) throw new Error(`Thiếu dữ liệu giá vốn theo lô cho ${item.name}; chưa thể bán.`);
      lines.push({ itemId: item._id, sku: requestedSku, name: item.name, quantity, unitPrice, defaultUnitPrice, priceLevel: fixedPriceLabels[priceField], priceField, pv: Number(item.pv), unitCost: cost / quantity, priceListVersionId: priceList._id });
    }
    const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const totalPv = lines.reduce((sum, line) => sum + line.quantity * line.pv, 0);
    const saleData = { ownerId, soldAt, sellerName: String(seller.fullName).trim(), sellerAddress: sellerAddress.slice(0, 500), sellerPhone: String(seller.phoneNumber).trim().slice(0, 40), sellerAddressGroupId, buyerType, buyerUserId: buyer.userId, buyerName: buyer.name, buyerMemberNumber: buyer.memberNumber, buyerAddress: buyerAddress.slice(0, 500), buyerPhone: buyerPhone.slice(0, 40), lines, subtotal: total, total, totalPv, note: String(req.body.note || '').slice(0, 1000) };
    let sale: any; let lastError: any;
    for (let attempt = 0; attempt < 4 && !sale; attempt++) {
      try { sale = await Sale.create({ ...saleData, invoiceNumber: invoiceNumber(soldAt) }); }
      catch (error: any) { lastError = error; if (error.code !== 11000) throw error; }
    }
    if (!sale) throw lastError || new Error('Không thể tạo mã hoá đơn duy nhất.');
    createdSaleId = sale._id;
    for (const entry of lines) await InventoryMovement.create({ ownerId, itemId: entry.itemId, type: 'sale', quantityDelta: -entry.quantity, unitCost: entry.unitCost, referenceId: sale._id, actorId: ownerId, reason: sale.invoiceNumber });
    if (soldAt.getTime() < Date.now() - 60_000) await logAudit(req, 'SALE_BACKDATE', `Bán hàng backdate ${soldAt.toISOString()} (${sale.invoiceNumber})`, String(sale._id), sale.invoiceNumber);
    console.log('[Inventory] Sale completed:', { ownerId, invoiceNumber: sale.invoiceNumber, total, totalPv });
    res.status(201).json(sale);
  } catch (error: any) {
    if (createdSaleId) { await InventoryMovement.deleteMany({ ownerId, referenceId: createdSaleId }); await Sale.deleteOne({ _id: createdSaleId, ownerId }); }
    for (const item of rollback) {
      await InventoryItem.updateOne({ _id: item.itemId, ownerId }, { $inc: { quantity: item.quantity } });
      for (const lotRef of item.lots) await InventoryLot.updateOne({ _id: lotRef.lotId }, { $inc: { remainingQuantity: lotRef.quantity } });
    }
    console.error('[Inventory] Sale failed and stock rolled back:', error);
    res.status(400).json({ message: error.message || 'Không thể hoàn tất đơn hàng.' });
  }
});

router.put('/sales/:id/buyer', inventorySeller, async (req: Request, res: Response) => {
  try {
    const sale: any = await Sale.findOne({ _id: req.params.id, ownerId: idOf(req) });
    if (!sale || sale.status === 'cancelled' || sale.status === 'returned') return res.status(404).json({ message: 'Không tìm thấy hoá đơn có thể sửa.' });
    let next = { type: req.body.buyerType, userId: null as any, name: String(req.body.buyerName || '').trim(), memberNumber: '', address: String(req.body.buyerAddress || '').trim(), phone: String(req.body.buyerPhone || '').trim() };
    if (next.type === 'member') {
      const member = await User.findOne({ _id: req.body.buyerUserId, status: 'ACTIVE' }).select('_id fullName memberNumber address phoneNumber');
      if (!member) return res.status(400).json({ message: 'Hội viên không hợp lệ.' });
      next = { type: 'member', userId: member._id, name: String(member.fullName || '').trim() || 'Hội viên', memberNumber: safeMemberNumber(member.memberNumber), address: next.address || String(member.address || '').trim(), phone: next.phone || String(member.phoneNumber || '').trim() };
    } else if (next.type === 'walk-in') next.name = 'Khách lẻ';
    else if (next.type !== 'custom' || !next.name) return res.status(400).json({ message: 'Người mua không hợp lệ.' });
    if (!next.address || !next.phone) return res.status(400).json({ message: 'Cần nhập đầy đủ địa chỉ và số điện thoại người mua.' });
    sale.buyerChanges.push({ fromName: sale.buyerName, fromUserId: sale.buyerUserId, toName: next.name, toUserId: next.userId, actorId: idOf(req), createdAt: new Date() });
    sale.buyerType = next.type; sale.buyerUserId = next.userId; sale.buyerName = next.name; sale.buyerMemberNumber = next.memberNumber;
    sale.buyerAddress = next.address; sale.buyerPhone = next.phone;
    await sale.save(); await logAudit(req, 'SALE_BUYER_CHANGE', `Đổi người mua hoá đơn ${sale.invoiceNumber}: ${sale.buyerName}`, String(sale._id), sale.invoiceNumber);
    res.json(sale);
  } catch (error: any) { console.error('[Inventory] Buyer update failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/sales/:id/return', inventorySeller, async (req: Request, res: Response) => {
  const ownerId = idOf(req); const changedItems: Array<{ itemId: any; quantity: number }> = []; const createdLots: any[] = []; const createdMovements: any[] = []; let lockedSaleId: any = null;
  try {
    let sale: any = await Sale.findOne({ _id: req.params.id, ownerId });
    const reason = String(req.body.reason || '').trim(); const returnLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!sale || sale.status === 'cancelled' || !reason || !returnLines.length) return res.status(400).json({ message: 'Hoá đơn, lý do hoặc số lượng hoàn không hợp lệ.' });
    let refundAmount = 0; const normalized: any[] = [];
    const combined = new Map<string, number>();
    for (const input of returnLines) combined.set(String(input.itemId), (combined.get(String(input.itemId)) || 0) + Number(input.quantity || 0));
    for (const [itemId, quantity] of combined) {
      const soldLine = sale.lines.find((item: any) => String(item.itemId) === itemId);
      const alreadyReturned = sale.returnedLines.filter((item: any) => String(item.itemId) === itemId).reduce((sum: number, item: any) => sum + item.quantity, 0);
      if (!soldLine || !Number.isInteger(quantity) || quantity <= 0 || alreadyReturned + quantity > soldLine.quantity) return res.status(400).json({ message: 'Số lượng hoàn vượt quá số lượng đã bán.' });
      const amount = quantity * soldLine.unitPrice; refundAmount += amount; normalized.push({ itemId: soldLine.itemId, quantity, refundAmount: amount });
    }
    const lockedSale: any = await Sale.findOneAndUpdate({ _id: sale._id, ownerId, status: sale.status, $or: [{ operationLockUntil: null }, { operationLockUntil: { $lt: new Date() } }] }, { $set: { operationLockUntil: new Date(Date.now() + 60_000) } }, { new: true });
    if (!lockedSale) return res.status(409).json({ message: 'Hoá đơn đang được xử lý ở thao tác khác. Hãy thử lại.' });
    sale = lockedSale; lockedSaleId = sale._id;
    for (const line of normalized) {
      const updatedItem = await InventoryItem.updateOne({ _id: line.itemId, ownerId }, { $inc: { quantity: line.quantity } });
      if (!updatedItem.matchedCount) throw new Error('Không tìm thấy mặt hàng cần hoàn về kho.');
      changedItems.push({ itemId: line.itemId, quantity: line.quantity });
      const soldLine = sale.lines.find((item: any) => String(item.itemId) === String(line.itemId));
      const lot: any = await InventoryLot.create({ ownerId, itemId: line.itemId, receivedQuantity: line.quantity, remainingQuantity: line.quantity, unitCost: soldLine.unitCost, receivedAt: new Date() }); createdLots.push(lot._id);
      const movement: any = await InventoryMovement.create({ ownerId, itemId: line.itemId, type: 'return', quantityDelta: line.quantity, unitCost: soldLine.unitCost, referenceId: sale._id, actorId: ownerId, reason }); createdMovements.push(movement._id);
      sale.returnedLines.push(line);
    }
    sale.returnEvents.push({ reason, note: String(req.body.note || ''), refundAmount, lines: normalized, actorId: idOf(req), createdAt: new Date() });
    const returnedCount = sale.returnedLines.reduce((sum: number, item: any) => sum + item.quantity, 0); const soldCount = sale.lines.reduce((sum: number, item: any) => sum + item.quantity, 0);
    sale.status = returnedCount >= soldCount ? 'returned' : 'partially_returned'; sale.operationLockUntil = null; await sale.save(); lockedSaleId = null;
    await logAudit(req, 'SALE_RETURN', `Hoàn hàng ${sale.invoiceNumber}; lý do: ${reason}; hoàn tiền dự kiến: ${refundAmount}`, String(sale._id), sale.invoiceNumber);
    res.json({ sale, refundAmount });
  } catch (error: any) {
    for (const changed of changedItems) await InventoryItem.updateOne({ _id: changed.itemId, ownerId }, { $inc: { quantity: -changed.quantity } });
    if (createdLots.length) await InventoryLot.deleteMany({ _id: { $in: createdLots }, ownerId });
    if (createdMovements.length) await InventoryMovement.deleteMany({ _id: { $in: createdMovements }, ownerId });
    if (lockedSaleId) await Sale.updateOne({ _id: lockedSaleId, ownerId }, { $set: { operationLockUntil: null } });
    console.error('[Inventory] Return failed and was rolled back:', error); res.status(500).json({ message: error.message });
  }
});

router.post('/sales/:id/cancel', inventorySeller, async (req: Request, res: Response) => {
  const ownerId = idOf(req); const changedItems: Array<{ itemId: any; quantity: number }> = []; const createdLots: any[] = []; const createdMovements: any[] = []; let lockedSaleId: any = null;
  try {
    let sale: any = await Sale.findOne({ _id: req.params.id, ownerId }); const reason = String(req.body.reason || '').trim();
    if (!sale || sale.status !== 'completed' || !reason) return res.status(400).json({ message: 'Chỉ có thể huỷ hoá đơn chưa hoàn hàng; cần nhập lý do.' });
    const lockedSale: any = await Sale.findOneAndUpdate({ _id: sale._id, ownerId, status: 'completed', $or: [{ operationLockUntil: null }, { operationLockUntil: { $lt: new Date() } }] }, { $set: { operationLockUntil: new Date(Date.now() + 60_000) } }, { new: true });
    if (!lockedSale) return res.status(409).json({ message: 'Hoá đơn đang được xử lý ở thao tác khác. Hãy thử lại.' });
    sale = lockedSale; lockedSaleId = sale._id;
    for (const line of sale.lines) {
      const qty = line.quantity - sale.returnedLines.filter((r: any) => String(r.itemId) === String(line.itemId)).reduce((sum: number, r: any) => sum + r.quantity, 0);
      if (qty <= 0) continue;
      const updatedItem = await InventoryItem.updateOne({ _id: line.itemId, ownerId }, { $inc: { quantity: qty } });
      if (!updatedItem.matchedCount) throw new Error('Không tìm thấy mặt hàng cần hoàn về kho.');
      changedItems.push({ itemId: line.itemId, quantity: qty });
      const lot: any = await InventoryLot.create({ ownerId, itemId: line.itemId, receivedQuantity: qty, remainingQuantity: qty, unitCost: line.unitCost, receivedAt: new Date() }); createdLots.push(lot._id);
      const movement: any = await InventoryMovement.create({ ownerId, itemId: line.itemId, type: 'cancel', quantityDelta: qty, unitCost: line.unitCost, referenceId: sale._id, actorId: ownerId, reason }); createdMovements.push(movement._id);
    }
    sale.status = 'cancelled'; sale.cancelledAt = new Date(); sale.cancelReason = reason; sale.operationLockUntil = null; await sale.save(); lockedSaleId = null;
    await logAudit(req, 'SALE_CANCEL', `Huỷ hoá đơn ${sale.invoiceNumber}; lý do: ${reason}`, String(sale._id), sale.invoiceNumber);
    res.json(sale);
  } catch (error: any) {
    for (const changed of changedItems) await InventoryItem.updateOne({ _id: changed.itemId, ownerId }, { $inc: { quantity: -changed.quantity } });
    if (createdLots.length) await InventoryLot.deleteMany({ _id: { $in: createdLots }, ownerId });
    if (createdMovements.length) await InventoryMovement.deleteMany({ _id: { $in: createdMovements }, ownerId });
    if (lockedSaleId) await Sale.updateOne({ _id: lockedSaleId, ownerId }, { $set: { operationLockUntil: null } });
    console.error('[Inventory] Cancellation failed and was rolled back:', error); res.status(500).json({ message: error.message });
  }
});

router.delete('/sales/cancelled', inventorySeller, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    console.log('[Inventory] Delete all cancelled sales started:', { ownerId });
    const cancelledSales = await Sale.find({ ownerId, status: 'cancelled' }).select('_id invoiceNumber').lean();
    if (!cancelledSales.length) {
      return res.status(400).json({ message: 'Không có hóa đơn đã hủy nào để xóa.' });
    }
    const cancelledIds = cancelledSales.map((s: any) => s._id);
    const invoiceNumbers = cancelledSales.map((s: any) => s.invoiceNumber);
    await InventoryMovement.deleteMany({ ownerId, referenceId: { $in: cancelledIds } });
    const result = await Sale.deleteMany({ _id: { $in: cancelledIds }, ownerId, status: 'cancelled' });
    await logAudit(req, 'SALE_DELETE_BULK', `Xóa ${result.deletedCount} hóa đơn đã hủy: ${invoiceNumbers.slice(0, 10).join(', ')}`);
    console.log('[Inventory] All cancelled sales deleted:', { ownerId, deletedCount: result.deletedCount });
    res.json({ success: true, deletedCount: result.deletedCount, deletedIds: cancelledIds.map(String) });
  } catch (error: any) {
    console.error('[Inventory] Delete all cancelled sales failed:', error);
    res.status(500).json({ message: error.message || 'Không thể xóa các hóa đơn đã hủy.' });
  }
});

router.delete('/sales/:id', inventorySeller, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    console.log('[Inventory] Delete cancelled sale started:', { ownerId, saleId: req.params.id });
    const sale: any = await Sale.findOne({ _id: req.params.id, ownerId }).select('_id invoiceNumber status').lean();
    if (!sale) return res.status(404).json({ message: 'Không tìm thấy hoá đơn trong lịch sử của bạn.' });
    if (sale.status !== 'cancelled') {
      return res.status(400).json({ message: 'Chỉ có thể xóa những hóa đơn đang ở trạng thái đã hủy.' });
    }
    await InventoryMovement.deleteMany({ ownerId, referenceId: sale._id });
    const deletion = await Sale.deleteOne({ _id: sale._id, ownerId, status: 'cancelled' });
    if (!deletion.deletedCount) {
      return res.status(404).json({ message: 'Hóa đơn đã bị xóa hoặc không còn ở trạng thái đã hủy.' });
    }
    await logAudit(req, 'SALE_DELETE', `Xóa hóa đơn đã hủy ${sale.invoiceNumber}`, String(sale._id), sale.invoiceNumber);
    console.log('[Inventory] Cancelled sale deleted:', { ownerId, saleId: String(sale._id), invoiceNumber: sale.invoiceNumber });
    res.json({ success: true, id: String(sale._id), invoiceNumber: sale.invoiceNumber });
  } catch (error: any) {
    console.error('[Inventory] Delete cancelled sale failed:', error);
    res.status(500).json({ message: error.message || 'Không thể xóa hóa đơn đã hủy.' });
  }
});

router.get('/overview', inventorySeller, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    const canManageCatalog = Boolean(req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE));
    const [items, lots, priceList, recentSales, monthly] = await Promise.all([
      loadPersonalItems(ownerId, canManageCatalog),
      InventoryLot.find({ ownerId, remainingQuantity: { $gt: 0 } }).lean(),
      currentPrices(new Date()),
      Sale.find({ ownerId }).sort({ soldAt: -1 }).limit(10).lean(),
      Sale.aggregate([
        { $match: { ownerId: new mongoose.Types.ObjectId(ownerId) } },
        { $sort: { soldAt: -1 } },
        { $limit: 5000 },
        { $match: { status: { $ne: 'cancelled' } } },
        { $project: {
          month: { $dateToString: { format: '%Y-%m', date: '$soldAt', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
          netSales: { $max: [0, { $subtract: [
            { $ifNull: ['$total', 0] },
            { $sum: { $map: { input: { $ifNull: ['$returnEvents', []] }, as: 'event', in: { $ifNull: ['$$event.refundAmount', 0] } } } },
          ] }] },
          netPv: { $max: [0, { $subtract: [
            { $ifNull: ['$totalPv', 0] },
            { $sum: { $map: {
              input: { $ifNull: ['$returnedLines', []] },
              as: 'returned',
              in: { $multiply: [
                { $ifNull: ['$$returned.quantity', 0] },
                { $let: {
                  vars: { matchedLine: { $arrayElemAt: [{ $filter: {
                    input: { $ifNull: ['$lines', []] },
                    as: 'line',
                    cond: { $eq: ['$$line.itemId', '$$returned.itemId'] },
                  } }, 0] } },
                  in: { $ifNull: ['$$matchedLine.pv', 0] },
                } },
              ] },
            } } },
          ] }] },
        } },
        { $group: { _id: '$month', sales: { $sum: '$netSales' }, pv: { $sum: '$netPv' }, orders: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $project: { _id: 0, month: '$_id', sales: 1, pv: 1, orders: 1 } },
      ]),
    ]);
    const activeItems = (items as any[]).filter(item => !item.archived || Number(item.quantity || 0) > 0);
    const priceMap = new Map<string, any>((priceList?.entries || []).map((entry: any) => [String(entry.sku), entry] as [string, any]));
    const itemMap = new Map(activeItems.map((item: any) => [String(item._id), item]));
    let costValue = 0; for (const lot of lots as any[]) costValue += lot.remainingQuantity * lot.unitCost;
    const estimated = { price100: 0, price25: 0, price35: 0, price42: 0, price50: 0 };
    for (const item of activeItems as any[]) { const price: any = priceMap.get(item.sku) || item.prices; if (price) for (const key of Object.keys(estimated) as Array<keyof typeof estimated>) estimated[key] += item.quantity * price[key]; }
    const lowStock = (activeItems as any[]).filter(item => !item.archived && item.quantity <= item.lowStockThreshold);
    res.json({ itemCount: activeItems.length, totalUnits: (activeItems as any[]).reduce((s, i) => s + i.quantity, 0), costValue, estimated, lowStock: lowStock.map((i: any) => ({ id: String(i._id), sku: i.sku, name: i.name, quantity: i.quantity, threshold: i.lowStockThreshold })), monthly: monthly.slice(-12), recentSales, itemMap: Object.fromEntries([...itemMap.entries()]) });
  } catch (error: any) { console.error('[Inventory] Overview failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/reports/member-purchases', inventorySeller, async (req: Request, res: Response) => {
  try {
    const period = String(req.query.period || 'month'); const now = new Date(); const from = validDate(req.query.from) || new Date(now.getFullYear(), now.getMonth(), 1); const to = validDate(req.query.to) || now;
    if (period === 'quarter' && !req.query.from) from.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
    if (period === 'year' && !req.query.from) from.setMonth(0, 1);
    const memberSales: any[] = await Sale.find({ ownerId: idOf(req), buyerUserId: { $ne: null }, soldAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } }).lean();
    const grouped = new Map<string, any>();
    for (const sale of memberSales) { const key = String(sale.buyerUserId); const net = netSaleTotals(sale); const row = grouped.get(key) || { _id: sale.buyerUserId, sales: 0, pv: 0, units: 0, orders: 0 }; row.sales += net.sales; row.pv += net.pv; row.units += net.units; row.orders++; grouped.set(key, row); }
    const rows = [...grouped.values()].sort((a, b) => b.sales - a.sales);
    const users = await User.find({ _id: { $in: rows.map(row => row._id) } }).select('fullName memberNumber').lean(); const userMap = new Map(users.map((u: any) => [String(u._id), u]));
    res.json(rows.map(row => ({ ...row, member: userMap.get(String(row._id)) })));
  } catch (error: any) { console.error('[Inventory] Member report failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/reports/analytics', inventorySeller, async (req: Request, res: Response) => {
  try {
    const ownerId = String(idOf(req));
    console.log('[Inventory] Analytics report requested:', { ownerId, query: req.query });
    const report = await buildInventoryAnalyticsReport(ownerId, req.query as Record<string, any>);
    res.json(report);
  } catch (error: any) {
    console.error('[Inventory] Analytics report failed:', error);
    res.status(500).json({ message: error.message || 'Không thể tải dữ liệu báo cáo.' });
  }
});

router.get('/print-preference', inventorySeller, async (req: Request, res: Response) => {
  try { const pref = await SellerPrintPreference.findOneAndUpdate({ ownerId: idOf(req) }, { $setOnInsert: { format: 'pdf' } }, { new: true, upsert: true }); res.json(pref); }
  catch (error: any) { res.status(500).json({ message: error.message }); }
});
router.put('/print-preference', inventorySeller, async (req: Request, res: Response) => {
  try { const pref = await SellerPrintPreference.findOneAndUpdate({ ownerId: idOf(req) }, { $set: { format: ['pdf', 'image'].includes(req.body.format) ? req.body.format : 'pdf', shopName: String(req.body.shopName || '').slice(0, 120), phone: String(req.body.phone || '').slice(0, 40), address: String(req.body.address || '').slice(0, 250) } }, { new: true, upsert: true }); res.json(pref); }
  catch (error: any) { res.status(500).json({ message: error.message }); }
});

export default router;
