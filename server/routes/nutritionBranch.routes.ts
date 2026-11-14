import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { NutritionBranch } from '../models/NutritionBranch.ts';
import { NutritionGroup } from '../models/NutritionGroup.ts';
import { User } from '../models/User.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';

const router = Router();

const hasPermission = async (userId: string, permission: string): Promise<boolean> => {
  const { getEffectivePermissions } = await import('../services/permissionService.ts');
  return (await getEffectivePermissions(userId)).includes(permission);
};

// Middleware xác thực cho tất cả routes trong file này
router.use(authMiddleware);

// GET /api/nutrition-branches - Danh sách tất cả nhánh (admin)
router.get('/', requirePermission([RESOURCES.NDD.SYSTEM, RESOURCES.NDD.BRANCH_ADMIN, RESOURCES.NDD.ADMIN]), async (req: Request, res: Response) => {
  try {
    const branches = await NutritionBranch.find()
      .populate('tabHeadId', 'fullName username')
      .populate('nutritionGroupIds', 'name ownerName ownerId address members coOwners isActive scaleCode')
      .sort({ createdAt: -1 });
    res.json(branches);
  } catch (err: any) {
    console.error('[NutritionBranch] List error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải danh sách nhánh' });
  }
});

// GET /api/nutrition-branches/my-branches - Nhánh của HLV (dựa trên NDD họ quản lý)
router.get('/my-branches', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    // Tìm các NDD mà user là owner hoặc co-owner
    const myNddIds = await NutritionGroup.find({ $or: [{ ownerId: userId }, { coOwners: userId }], isActive: true }).select('_id');
    const nddIdList = myNddIds.map(g => g._id);
    const branches = await NutritionBranch.find({
      $or: [{ nutritionGroupIds: { $in: nddIdList } }, { tabHeadId: userId }],
    }).populate('tabHeadId', 'fullName username').populate('nutritionGroupIds', 'name ownerName ownerId address members coOwners isActive scaleCode');

    res.json(branches);
  } catch (err: any) {
    console.error('[NutritionBranch] My branches error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải nhánh của bạn' });
  }
});

// POST /api/nutrition-branches - Tạo nhánh mới (admin)
router.post('/', requirePermission(RESOURCES.NDD.BRANCH_ADMIN), async (req: Request, res: Response) => {
  try {
    const { name, tabHeadId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên nhánh là bắt buộc' });
    }
    if (!tabHeadId) return res.status(400).json({ message: 'Hãy chọn TAB đầu nhánh.' });
    if (!await hasPermission(String(tabHeadId), RESOURCES.NDD.BRANCH_TAB)) return res.status(400).json({ message: 'Người được chọn chưa có Quyền TAB.' });

    const branch = new NutritionBranch({
      name: name.trim(),
      tabHeadId,
      nutritionGroupIds: [],
      memberIds: [],
      createdBy: (req as any).user?.userId,
      isActive: true,
    });
    await branch.save();
    const populated = await NutritionBranch.findById(branch._id).populate('tabHeadId', 'fullName username');
    console.log('[NutritionBranch] Branch created:', { branchId: String(branch._id), tabHeadId: String(tabHeadId), actorId: req.user!.userId });
    res.json(populated);
  } catch (err: any) {
    console.error('[NutritionBranch] Create error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tạo nhánh' });
  }
});

// PUT /api/nutrition-branches/:id - Sửa nhánh
router.put('/:id', requirePermission(RESOURCES.NDD.BRANCH_ADMIN), async (req: Request, res: Response) => {
  try {
    const { name, nutritionGroupIds, isActive, tabHeadId } = req.body;
    const branch = await NutritionBranch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });

    if (name !== undefined) branch.name = String(name).trim();
    if (tabHeadId !== undefined) {
      if (!tabHeadId) return res.status(400).json({ message: 'Hãy chọn TAB đầu nhánh.' });
      if (!await hasPermission(String(tabHeadId), RESOURCES.NDD.BRANCH_TAB)) {
        return res.status(400).json({ message: 'Người được chọn chưa có Quyền TAB.' });
      }
      branch.tabHeadId = tabHeadId;
    }
    if (nutritionGroupIds !== undefined) {
      if (!Array.isArray(nutritionGroupIds)) return res.status(400).json({ message: 'Danh sách NDD không hợp lệ.' });
      branch.nutritionGroupIds = nutritionGroupIds;
      // Cập nhật memberIds
      const ndds = await NutritionGroup.find({ _id: { $in: nutritionGroupIds } });
      const memberIds = new Set<string>();
      ndds.forEach(ndd => {
        (ndd.members || []).forEach((m: any) => { if (m) memberIds.add(String(m._id || m)); });
        if (ndd.ownerId) memberIds.add(String((ndd.ownerId as any)?._id || ndd.ownerId));
        (ndd.coOwners || []).forEach((c: any) => { if (c) memberIds.add(String(c._id || c)); });
      });
      branch.memberIds = Array.from(memberIds).map(id => new mongoose.Types.ObjectId(id));
    }
    if (typeof isActive === 'boolean') branch.isActive = isActive;
    await branch.save();
    const populated = await NutritionBranch.findById(branch._id).populate('tabHeadId', 'fullName username').populate('nutritionGroupIds', 'name ownerName ownerId address members coOwners isActive scaleCode');
    console.log('[NutritionBranch] Branch updated:', { branchId: String(branch._id), tabHeadId: String(branch.tabHeadId || ''), actorId: req.user!.userId });
    res.json(populated);
  } catch (err: any) {
    console.error('[NutritionBranch] Update error:', err.message);
    res.status(500).json({ message: 'Lỗi khi cập nhật nhánh' });
  }
});

// POST /api/nutrition-branches/:id/nutrition-groups - TAB đầu nhánh tạo NDD trong nhánh
router.post('/:id/nutrition-groups', async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh.' });
    const actorId = req.user!.userId;
    const isNddAdmin = req.user!.permissions.includes(RESOURCES.NDD.ADMIN);
    const isActiveTabHead = String(branch.tabHeadId || '') === actorId && await hasPermission(actorId, RESOURCES.NDD.BRANCH_TAB);
    if (!isActiveTabHead && !isNddAdmin) {
      return res.status(403).json({ message: 'Chỉ TAB đầu nhánh hoặc người quản trị NDD mới được thêm NDD vào nhánh này.' });
    }

    const { name, ownerId, ownerName, address } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName || !ownerId) return res.status(400).json({ message: 'Tên NDD và chủ vận hành là bắt buộc.' });
    const existing = await NutritionGroup.findOne({ name: cleanName });
    if (existing) return res.status(400).json({ message: 'Tên NDD đã tồn tại.' });
    if (!await hasPermission(String(ownerId), RESOURCES.COACH.ACCESS)) {
      return res.status(400).json({ message: 'Chủ vận hành phải có quyền Vận hành NDD.' });
    }
    const owner = await User.findById(ownerId).select('_id fullName');
    if (!owner) return res.status(400).json({ message: 'Không tìm thấy chủ vận hành đã chọn.' });

    const group = await NutritionGroup.create({
      name: cleanName,
      ownerId: owner._id,
      ownerName: ownerName || owner.fullName,
      address: typeof address === 'string' ? address.trim() : '',
      members: [owner._id],
      coOwners: [],
      isActive: true,
      pendingMembers: [],
    });
    await User.findByIdAndUpdate(owner._id, { nutritionGroupId: group._id, pendingNutritionGroupId: null });
    branch.nutritionGroupIds = [...new Set([...(branch.nutritionGroupIds || []).map((id: any) => String(id)), String(group._id)])] as any;
    branch.memberIds = [...new Set([...(branch.memberIds || []).map((id: any) => String(id)), String(owner._id)])] as any;
    await branch.save();
    console.log('[NutritionBranch][NDD] Group created inside branch:', { branchId: String(branch._id), groupId: String(group._id), ownerId: String(owner._id), actorId });
    res.json({ ...group.toObject(), id: group._id });
  } catch (error: any) {
    console.error('[NutritionBranch][NDD] Failed to create group in branch:', error);
    res.status(500).json({ message: error.message || 'Không thể tạo NDD trong nhánh.' });
  }
});

// DELETE /api/nutrition-branches/:id - Xóa nhánh
router.delete('/:id', requirePermission(RESOURCES.NDD.BRANCH_ADMIN), async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findByIdAndDelete(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });
    console.log(`[NutritionBranch] ✅ Deleted branch "${branch.name}"`);
    res.json({ success: true, message: 'Đã xóa nhánh' });
  } catch (err: any) {
    console.error('[NutritionBranch] Delete error:', err.message);
    res.status(500).json({ message: 'Lỗi khi xóa nhánh' });
  }
});

// POST /api/nutrition-branches/:id/message - Gửi tin nhắn trong nhánh
router.post('/:id/message', async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });
    if (!branch.isActive) return res.status(400).json({ message: 'Nhánh này hiện không hoạt động' });

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Nội dung tin nhắn là bắt buộc' });
    }

    const senderId = (req as any).user?.userId;
    const senderName = (req as any).user?.fullName || 'Unknown';

    const newMessage = {
      senderId,
      senderName,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
    };

    branch.messages.push(newMessage);
    branch.lastMessage = { content: content.trim(), senderName, timestamp: new Date().toISOString() };
    await branch.save();

    console.log(`[NutritionBranch] 💬 Message sent in "${branch.name}" by ${senderName}`);
    res.json(newMessage);
  } catch (err: any) {
    console.error('[NutritionBranch] Message error:', err.message);
    res.status(500).json({ message: 'Lỗi khi gửi tin nhắn' });
  }
});

// GET /api/nutrition-branches/:id/messages - Lấy tin nhắn trong nhánh
router.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findById(req.params.id).select('messages');
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });
    res.json(branch.messages || []);
  } catch (err: any) {
    console.error('[NutritionBranch] Get messages error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải tin nhắn' });
  }
});

// GET /api/nutrition-branches/:id/members-metrics - Lấy chỉ số member trong nhánh
router.get('/:id/members-metrics', async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findById(req.params.id)
      .populate('memberIds', 'fullName username avatar');
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });

    // Lấy chỉ số mới nhất cho mỗi member
    const Metric = require('mongoose').model('Metric');
    const members = await Promise.all(
      branch.memberIds.map(async (member: any) => {
        const latestMetric = await Metric.findOne({ userId: member._id })
          .sort({ date: -1 })
          .select('weight bodyFat muscleMass date');
        return {
          user: member,
          latestMetric: latestMetric || null,
        };
      })
    );

    res.json(members);
  } catch (err: any) {
    console.error('[NutritionBranch] Members metrics error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải chỉ số' });
  }
});

export default router;
