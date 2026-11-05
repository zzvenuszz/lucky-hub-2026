import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { User } from '../models/User.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { uploadImageToStorageProvider } from '../services/storage/imageStorageService.ts';
import { SystemSettings } from '../models/SystemSettings.ts';
import { InventoryCategory, InventoryItem, InventoryLot, InventoryMovement, PriceListVersion, Sale, SellerPrintPreference } from '../models/Inventory.ts';

const router = Router();
router.use(authMiddleware);
const inventory = requirePermission(RESOURCES.INVENTORY.MANAGE);
const priceManager = requirePermission(RESOURCES.PRICELIST.MANAGE);
const levelManager = requirePermission(RESOURCES.MEMBER_LEVEL.MANAGE);
const anyLevelManager = requirePermission([RESOURCES.MEMBER_LEVEL.MANAGE, RESOURCES.MEMBER_LEVEL.MANAGE_ANY]);
const idOf = (req: Request) => (req as any).user.userId;
const memberPriceKey: Record<string, string> = { customer: 'price100', member: 'price25', senior_consultant: 'price35', success_builder: 'price42', supervisor: 'price50' };
const memberPriceLabel: Record<string, string> = { customer: 'Giá 100%', member: 'Giá 25%', senior_consultant: 'Giá 35%', success_builder: 'Giá 42%', supervisor: 'Giá 50%' };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const logAudit = async (req: Request, type: string, details: string, targetId?: string, targetName?: string) => {
  const actor = (req as any).user;
  try { await new AuditLog({ actorId: actor.userId, actorName: actor.fullName, targetId, targetName, type, details, timestamp: new Date().toISOString() }).save(); }
  catch (error) { console.error('[Inventory] Audit log write failed:', error); }
};
const validDate = (value: any) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
};
const currentPrices = async (at: Date) => PriceListVersion.findOne({ effectiveFrom: { $lte: at }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }] }).sort({ effectiveFrom: -1 }).lean();
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
router.get('/members', inventory, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const safeQuery = escapeRegex(q);
    const members = await User.find({ status: 'ACTIVE', memberNumber: { $ne: '' }, $or: [{ fullName: { $regex: safeQuery, $options: 'i' } }, { memberNumber: { $regex: safeQuery, $options: 'i' } }] })
      .select('_id fullName memberNumber memberLevel').limit(15).lean();
    res.json(members.map((m: any) => ({ id: String(m._id), fullName: m.fullName, memberNumber: m.memberNumber, memberLevel: m.memberLevel })));
  } catch (error: any) { console.error('[Inventory] Member lookup failed:', error); res.status(500).json({ message: 'Không thể tìm hội viên.' }); }
});

router.get('/categories', inventory, async (req: Request, res: Response) => {
  try { res.json(await InventoryCategory.find({ ownerId: idOf(req) }).sort({ name: 1 }).lean()); }
  catch (error: any) { console.error('[Inventory] Categories load failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/categories', inventory, async (req: Request, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 80) return res.status(400).json({ message: 'Tên danh mục bắt buộc và tối đa 80 ký tự.' });
    const category = await InventoryCategory.create({ ownerId: idOf(req), name });
    console.log('[Inventory] Category created:', { ownerId: idOf(req), name });
    res.status(201).json(category);
  } catch (error: any) { console.error('[Inventory] Category create failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'Danh mục này đã có trong kho của bạn.' : error.message }); }
});

router.get('/items', inventory, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req);
    const items = await InventoryItem.find({ ownerId, archived: false }).sort({ name: 1 }).lean();
    const prices = await currentPrices(new Date());
    const priceMap = new Map<string, any>((prices?.entries || []).map((entry: any) => [String(entry.sku), entry] as [string, any]));
    res.json(items.map((item: any) => ({ ...item, id: String(item._id), prices: priceMap.get(item.sku) || null })));
  } catch (error: any) { console.error('[Inventory] Items load failed:', error); res.status(500).json({ message: 'Không thể tải kho hàng.' }); }
});

router.post('/items', inventory, async (req: Request, res: Response) => {
  try {
    const { sku, name, imageUrl, pv, quantity = 0, lowStockThreshold = 5 } = req.body;
    if (!String(sku || '').trim() || !String(name || '').trim() || !Number.isFinite(Number(pv)) || Number(pv) < 0 || Number(quantity) < 0) return res.status(400).json({ message: 'SKU, tên, PV hoặc số lượng không hợp lệ.' });
    let finalImage = typeof imageUrl === 'string' ? imageUrl : '';
    if (finalImage.startsWith('data:image')) {
      const settings = await SystemSettings.findOne({}).select('storage').lean();
      const provider: any = settings?.storage?.providers?.find((p: any) => p.isActive);
      if (!provider) return res.status(400).json({ message: 'Chưa cấu hình dịch vụ lưu ảnh.' });
      finalImage = await uploadImageToStorageProvider(finalImage, provider, 'inventory');
    }
    let categoryId = null; let categoryName = '';
    if (req.body.categoryId) {
      const category = await InventoryCategory.findOne({ _id: req.body.categoryId, ownerId: idOf(req) }).select('name');
      if (!category) return res.status(400).json({ message: 'Danh mục không thuộc kho của bạn.' });
      categoryId = category._id; categoryName = category.name;
    }
    const item = await InventoryItem.create({ ownerId: idOf(req), sku: String(sku).trim().toUpperCase(), name: String(name).trim(), categoryId, categoryName, imageUrl: finalImage, pv: Number(pv), quantity: 0, lowStockThreshold: Math.max(0, Number(lowStockThreshold) || 0) });
    if (Number(quantity) > 0) {
      const unitCost = Number(req.body.unitCost || 0);
      const lot = await InventoryLot.create({ ownerId: idOf(req), itemId: item._id, receivedQuantity: Number(quantity), remainingQuantity: Number(quantity), unitCost, receivedAt: new Date() });
      await InventoryItem.updateOne({ _id: item._id, ownerId: idOf(req) }, { $inc: { quantity: Number(quantity) } });
      await InventoryMovement.create({ ownerId: idOf(req), itemId: item._id, lotId: lot._id, type: 'receive', quantityDelta: Number(quantity), unitCost, actorId: idOf(req), reason: 'Tạo mặt hàng và nhập kho ban đầu' });
    }
    console.log('[Inventory] Item created:', { ownerId: idOf(req), sku: item.sku });
    res.status(201).json({ ...item.toObject(), quantity: Number(quantity), id: String(item._id) });
  } catch (error: any) { console.error('[Inventory] Create item failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'SKU đã tồn tại trong kho của bạn.' : error.message || 'Không thể tạo mặt hàng.' }); }
});

router.put('/items/:id', inventory, async (req: Request, res: Response) => {
  try {
    const patch: any = {};
    for (const key of ['sku', 'name', 'imageUrl', 'pv', 'lowStockThreshold', 'archived']) if (req.body[key] !== undefined) patch[key] = req.body[key];
    if (req.body.categoryId !== undefined) {
      if (!req.body.categoryId) { patch.categoryId = null; patch.categoryName = ''; }
      else {
        const category = await InventoryCategory.findOne({ _id: req.body.categoryId, ownerId: idOf(req) }).select('name');
        if (!category) return res.status(400).json({ message: 'Danh mục không thuộc kho của bạn.' });
        patch.categoryId = category._id; patch.categoryName = category.name;
      }
    }
    if (patch.sku) patch.sku = String(patch.sku).trim().toUpperCase();
    if (patch.imageUrl?.startsWith('data:image')) {
      const settings = await SystemSettings.findOne({}).select('storage').lean();
      const provider: any = settings?.storage?.providers?.find((p: any) => p.isActive);
      if (!provider) return res.status(400).json({ message: 'Chưa cấu hình dịch vụ lưu ảnh.' });
      patch.imageUrl = await uploadImageToStorageProvider(patch.imageUrl, provider, 'inventory');
    }
    const item = await InventoryItem.findOneAndUpdate({ _id: req.params.id, ownerId: idOf(req) }, { $set: patch }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: 'Không tìm thấy mặt hàng trong kho của bạn.' });
    res.json(item);
  } catch (error: any) { console.error('[Inventory] Update item failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'SKU đã tồn tại trong kho.' : error.message }); }
});

router.post('/items/:id/receive', inventory, async (req: Request, res: Response) => {
  try {
    const quantity = Number(req.body.quantity); const unitCost = Number(req.body.unitCost); const at = validDate(req.body.receivedAt);
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || !at) return res.status(400).json({ message: 'Số lượng, giá vốn hoặc thời gian nhập không hợp lệ.' });
    const item = await InventoryItem.findOne({ _id: req.params.id, ownerId: idOf(req), archived: false });
    if (!item) return res.status(404).json({ message: 'Không tìm thấy mặt hàng.' });
    const priceList = await currentPrices(at);
    const lot = await InventoryLot.create({ ownerId: idOf(req), itemId: item._id, receivedQuantity: quantity, remainingQuantity: quantity, unitCost, priceListVersionId: priceList?._id || null, receivedAt: at });
    await InventoryItem.updateOne({ _id: item._id, ownerId: idOf(req) }, { $inc: { quantity } });
    await InventoryMovement.create({ ownerId: idOf(req), itemId: item._id, lotId: lot._id, type: 'receive', quantityDelta: quantity, unitCost, actorId: idOf(req), reason: String(req.body.reason || 'Nhập hàng') });
    console.log('[Inventory] Stock received:', { ownerId: idOf(req), sku: item.sku, quantity, unitCost });
    res.status(201).json({ lot, quantity: item.quantity + quantity });
  } catch (error: any) { console.error('[Inventory] Receive stock failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/items/:id/adjust', inventory, async (req: Request, res: Response) => {
  try {
    const delta = Number(req.body.quantityDelta); const reason = String(req.body.reason || '').trim();
    if (!Number.isInteger(delta) || delta === 0 || !reason) return res.status(400).json({ message: 'Nhập số lượng điều chỉnh và lý do.' });
    const item = await InventoryItem.findOneAndUpdate({ _id: req.params.id, ownerId: idOf(req), quantity: { $gte: Math.max(0, -delta) } }, { $inc: { quantity: delta } }, { new: true });
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

router.get('/movements', inventory, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const movements = await InventoryMovement.find({ ownerId: idOf(req) }).populate('itemId', 'sku name').sort({ createdAt: -1 }).limit(limit).lean();
    res.json(movements);
  } catch (error: any) { console.error('[Inventory] Movement history failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/price-list', async (req: Request, res: Response) => {
  try {
    if (!req.user?.permissions.includes(RESOURCES.INVENTORY.MANAGE) && !req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE)) return res.status(403).json({ message: 'Bạn không có quyền xem bảng giá.' });
    const at = validDate(req.query.at) || new Date();
    const versions = await PriceListVersion.find().sort({ effectiveFrom: -1 }).limit(req.user?.permissions.includes(RESOURCES.PRICELIST.MANAGE) ? 100 : 1).lean();
    const active = await currentPrices(at);
    res.json({ active, versions });
  } catch (error: any) { console.error('[Inventory] Price list load failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/price-list', priceManager, async (req: Request, res: Response) => {
  try {
    const effectiveFrom = validDate(req.body.effectiveFrom);
    const entries = Array.isArray(req.body.entries) ? req.body.entries.map((entry: any) => ({ sku: String(entry.sku || '').trim().toUpperCase(), costReference: Number(entry.costReference || 0), price100: Number(entry.price100), price25: Number(entry.price25), price35: Number(entry.price35), price42: Number(entry.price42), price50: Number(entry.price50) })) : [];
    const uniqueSkus = new Set(entries.map((entry: any) => entry.sku));
    if (!effectiveFrom || !entries.length || uniqueSkus.size !== entries.length || entries.some((e: any) => !e.sku || ['costReference', 'price100', 'price25', 'price35', 'price42', 'price50'].some(key => !Number.isSafeInteger(e[key]) || e[key] < 0))) return res.status(400).json({ message: 'Ngày hiệu lực hoặc dữ liệu giá không hợp lệ; SKU phải duy nhất và giá phải là số nguyên không âm.' });
    const conflict = await PriceListVersion.findOne({ effectiveFrom: { $lt: effectiveFrom }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: effectiveFrom } }] }).sort({ effectiveFrom: -1 });
    const next = await PriceListVersion.findOne({ effectiveFrom: { $gt: effectiveFrom } }).sort({ effectiveFrom: 1 });
    if (conflict) conflict.effectiveTo = effectiveFrom;
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ message: 'Tên bảng giá bắt buộc và tối đa 100 ký tự.' });
    const doc = await PriceListVersion.create({ name, effectiveFrom, effectiveTo: next?.effectiveFrom || null, entries, createdBy: idOf(req), note: String(req.body.note || '') });
    await conflict?.save();
    await logAudit(req, 'PRICELIST_UPDATE', `Cập nhật bảng giá hiệu lực từ ${effectiveFrom.toISOString()}`);
    console.log('[Inventory] Price list version created:', { id: doc.id, effectiveFrom });
    res.status(201).json(doc);
  } catch (error: any) { console.error('[Inventory] Price list update failed:', error); res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'Đã tồn tại bảng giá tại thời điểm này.' : error.message }); }
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

router.get('/members/:id/purchases', inventory, async (req: Request, res: Response) => {
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
    let cursor: any = target; let isDownline = false; const visited = new Set<string>();
    const hasGlobalLevelPermission = req.user!.permissions.includes(RESOURCES.MEMBER_LEVEL.MANAGE_ANY);
    while (cursor?.sponsorUserId) {
      const sponsorId = String(cursor.sponsorUserId);
      if (sponsorId === String(idOf(req))) { isDownline = true; break; }
      if (visited.has(sponsorId)) return res.status(409).json({ message: 'Phát hiện vòng lặp trong quan hệ bảo trợ.' });
      visited.add(sponsorId); cursor = await User.findById(sponsorId).select('sponsorUserId').lean();
    }
    if (!hasGlobalLevelPermission && !isDownline) return res.status(403).json({ message: 'Chỉ được đổi cấp độ thành viên trong tuyến dưới của bạn.' });
    const levels = ['customer', 'member', 'senior_consultant', 'success_builder', 'supervisor'];
    if (!levels.includes(req.body.memberLevel) || (req.body.memberLevel !== 'customer' && !target.memberNumber)) return res.status(400).json({ message: 'Cấp độ không hợp lệ hoặc hội viên chưa có mã thẻ.' });
    const previous = target.memberLevel; target.memberLevel = req.body.memberLevel; await target.save();
    await logAudit(req, 'MEMBER_LEVEL_UPDATE', `Cấp độ ${previous} → ${target.memberLevel}; lý do: ${String(req.body.reason || 'Không ghi lý do')}`, String(target._id), target.fullName);
    res.json({ id: String(target._id), memberLevel: target.memberLevel });
  } catch (error: any) { console.error('[Inventory] Member level update failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/sales', inventory, async (req: Request, res: Response) => {
  try {
    const query: any = { ownerId: idOf(req) };
    if (req.query.from || req.query.to) query.soldAt = { ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}), ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}) };
    if (req.query.buyerUserId) query.buyerUserId = req.query.buyerUserId;
    const page = Math.max(1, Number(req.query.page || 1)); const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const [sales, total] = await Promise.all([Sale.find(query).sort({ soldAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Sale.countDocuments(query)]);
    res.json({ sales, total, page, limit });
  } catch (error: any) { console.error('[Inventory] Sales load failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/sales/:id', inventory, async (req: Request, res: Response) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, ownerId: idOf(req) }).lean();
    if (!sale) return res.status(404).json({ message: 'Không tìm thấy hoá đơn trong lịch sử của bạn.' });
    res.json(sale);
  } catch (error: any) { console.error('[Inventory] Invoice lookup failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/sales', inventory, async (req: Request, res: Response) => {
  const ownerId = idOf(req); const soldAt = validDate(req.body.soldAt);
  const rollback: Array<{ itemId: any; quantity: number; lots: Array<{ lotId: any; quantity: number }> }> = [];
  let createdSaleId: any = null;
  try {
    if (!soldAt || !Array.isArray(req.body.lines) || !req.body.lines.length) return res.status(400).json({ message: 'Đơn hàng hoặc thời gian bán không hợp lệ.' });
    const buyerType = req.body.buyerType;
    let buyer = { userId: null as any, name: String(req.body.buyerName || '').trim(), memberNumber: '' };
    let level = 'customer';
    if (buyerType === 'member') {
      const member = await User.findOne({ _id: req.body.buyerUserId, memberNumber: { $ne: '' } }).select('_id fullName memberNumber memberLevel');
      if (!member) return res.status(400).json({ message: 'Hội viên không hợp lệ hoặc chưa có mã thẻ.' });
      buyer = { userId: member._id, name: member.fullName, memberNumber: member.memberNumber }; level = member.memberLevel || 'customer';
    } else if (!['walk-in', 'custom'].includes(buyerType) || (buyerType === 'custom' && !buyer.name)) return res.status(400).json({ message: 'Thông tin người mua không hợp lệ.' });
    if (buyerType === 'walk-in') buyer.name = 'Khách lẻ';
    const priceList: any = await currentPrices(soldAt);
    if (!priceList) return res.status(400).json({ message: 'Chưa có bảng giá hiệu lực tại thời điểm bán.' });
    const priceField = memberPriceKey[level] || 'price100'; const priceLabel = memberPriceLabel[level] || 'Giá 100%';
    const lines: any[] = [];
    for (const input of req.body.lines) {
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Số lượng mặt hàng không hợp lệ.');
      const item: any = await InventoryItem.findOne({ _id: input.itemId, ownerId, archived: false }).lean();
      if (!item) throw new Error('Mặt hàng không thuộc kho của bạn.');
      const priceEntry: any = priceList.entries.find((entry: any) => entry.sku === item.sku);
      if (!priceEntry) throw new Error(`SKU ${item.sku} chưa có trong bảng giá.`);
      const defaultUnitPrice = Number(priceEntry[priceField]);
      const unitPrice = input.unitPrice === undefined ? defaultUnitPrice : Number(input.unitPrice);
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
      lines.push({ itemId: item._id, sku: item.sku, name: item.name, quantity, unitPrice, defaultUnitPrice, priceLevel: priceLabel, pv: Number(item.pv), unitCost: cost / quantity, priceListVersionId: priceList._id });
    }
    const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const totalPv = lines.reduce((sum, line) => sum + line.quantity * line.pv, 0);
    const saleData = { ownerId, soldAt, buyerType, buyerUserId: buyer.userId, buyerName: buyer.name, buyerMemberNumber: buyer.memberNumber, lines, subtotal: total, total, totalPv, note: String(req.body.note || '').slice(0, 1000) };
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

router.put('/sales/:id/buyer', inventory, async (req: Request, res: Response) => {
  try {
    const sale: any = await Sale.findOne({ _id: req.params.id, ownerId: idOf(req) });
    if (!sale || sale.status === 'cancelled' || sale.status === 'returned') return res.status(404).json({ message: 'Không tìm thấy hoá đơn có thể sửa.' });
    let next = { type: req.body.buyerType, userId: null as any, name: String(req.body.buyerName || '').trim(), memberNumber: '' };
    if (next.type === 'member') {
      const member = await User.findOne({ _id: req.body.buyerUserId, memberNumber: { $ne: '' } }).select('_id fullName memberNumber');
      if (!member) return res.status(400).json({ message: 'Hội viên không hợp lệ.' });
      next = { type: 'member', userId: member._id, name: member.fullName, memberNumber: member.memberNumber };
    } else if (next.type === 'walk-in') next.name = 'Khách lẻ';
    else if (next.type !== 'custom' || !next.name) return res.status(400).json({ message: 'Người mua không hợp lệ.' });
    sale.buyerChanges.push({ fromName: sale.buyerName, fromUserId: sale.buyerUserId, toName: next.name, toUserId: next.userId, actorId: idOf(req), createdAt: new Date() });
    sale.buyerType = next.type; sale.buyerUserId = next.userId; sale.buyerName = next.name; sale.buyerMemberNumber = next.memberNumber;
    await sale.save(); await logAudit(req, 'SALE_BUYER_CHANGE', `Đổi người mua hoá đơn ${sale.invoiceNumber}: ${sale.buyerName}`, String(sale._id), sale.invoiceNumber);
    res.json(sale);
  } catch (error: any) { console.error('[Inventory] Buyer update failed:', error); res.status(500).json({ message: error.message }); }
});

router.post('/sales/:id/return', inventory, async (req: Request, res: Response) => {
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

router.post('/sales/:id/cancel', inventory, async (req: Request, res: Response) => {
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

router.get('/overview', inventory, async (req: Request, res: Response) => {
  try {
    const ownerId = idOf(req); const [items, lots, priceList, sales] = await Promise.all([InventoryItem.find({ ownerId, archived: false }).lean(), InventoryLot.find({ ownerId, remainingQuantity: { $gt: 0 } }).lean(), currentPrices(new Date()), Sale.find({ ownerId }).sort({ soldAt: -1 }).limit(5000).lean()]);
    const priceMap = new Map<string, any>((priceList?.entries || []).map((entry: any) => [String(entry.sku), entry] as [string, any]));
    const itemMap = new Map(items.map((item: any) => [String(item._id), item]));
    let costValue = 0; for (const lot of lots as any[]) costValue += lot.remainingQuantity * lot.unitCost;
    const estimated = { price100: 0, price25: 0, price35: 0, price42: 0, price50: 0 };
    for (const item of items as any[]) { const price: any = priceMap.get(item.sku); if (price) for (const key of Object.keys(estimated) as Array<keyof typeof estimated>) estimated[key] += item.quantity * price[key]; }
    const lowStock = (items as any[]).filter(item => item.quantity <= item.lowStockThreshold);
    const monthly = sales.filter((sale: any) => sale.status !== 'cancelled').reduce((acc: any, sale: any) => { const date = new Date(sale.soldAt); const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; if (!acc[key]) acc[key] = { month: key, sales: 0, pv: 0, orders: 0 }; const net = netSaleTotals(sale); acc[key].sales += net.sales; acc[key].pv += net.pv; acc[key].orders++; return acc; }, {});
    res.json({ itemCount: items.length, totalUnits: (items as any[]).reduce((s, i) => s + i.quantity, 0), costValue, estimated, lowStock: lowStock.map((i: any) => ({ id: String(i._id), sku: i.sku, name: i.name, quantity: i.quantity, threshold: i.lowStockThreshold })), monthly: Object.values(monthly).slice(-12), recentSales: sales.slice(0, 10), itemMap: Object.fromEntries([...itemMap.entries()]) });
  } catch (error: any) { console.error('[Inventory] Overview failed:', error); res.status(500).json({ message: error.message }); }
});

router.get('/reports/member-purchases', inventory, async (req: Request, res: Response) => {
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

router.get('/print-preference', inventory, async (req: Request, res: Response) => {
  try { const pref = await SellerPrintPreference.findOneAndUpdate({ ownerId: idOf(req) }, { $setOnInsert: { format: 'pdf' } }, { new: true, upsert: true }); res.json(pref); }
  catch (error: any) { res.status(500).json({ message: error.message }); }
});
router.put('/print-preference', inventory, async (req: Request, res: Response) => {
  try { const pref = await SellerPrintPreference.findOneAndUpdate({ ownerId: idOf(req) }, { $set: { format: ['pdf', 'image'].includes(req.body.format) ? req.body.format : 'pdf', shopName: String(req.body.shopName || '').slice(0, 120), phone: String(req.body.phone || '').slice(0, 40), address: String(req.body.address || '').slice(0, 250) } }, { new: true, upsert: true }); res.json(pref); }
  catch (error: any) { res.status(500).json({ message: error.message }); }
});

export default router;
