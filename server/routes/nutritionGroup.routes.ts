import { Router, Request, Response } from 'express';
import { NutritionGroup } from '../models/NutritionGroup.ts';
import { User } from '../models/User.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/nutrition-groups - Danh sách NDD đang hoạt động (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const groups = await NutritionGroup.find({ isActive: true })
      .populate('ownerId', 'fullName username')
      .select('name ownerId ownerName address members')
      .sort({ name: 1 });
    res.json(groups.map(g => ({ 
      ...g.toObject(), 
      id: g._id,
      memberCount: g.members?.length || 0,
      ownerId: (g.ownerId as any)?._id || g.ownerId,
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/nutrition-groups/all - Tất cả NDD (admin only)
router.get('/all', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    const groups = await NutritionGroup.find()
      .populate('ownerId', 'fullName username')
      .populate('pendingMembers.userId', 'fullName username')
      .sort({ createdAt: -1 });
    res.json(groups.map(g => ({ ...g.toObject(), id: g._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nutrition-groups - Tạo NDD (admin)
router.post('/', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    const { name, ownerId, ownerName, address } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên NDD là bắt buộc' });
    }

    // Kiểm tra trùng tên
    const existing = await NutritionGroup.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Tên NDD đã tồn tại' });
    }

    const group = new NutritionGroup({
      name: name.trim(),
      ownerId: ownerId || req.user!.userId,
      ownerName: ownerName || req.user!.fullName,
      address: address || '',
      members: [],
      isActive: true,
      pendingMembers: [],
    });
    await group.save();

    console.log(`[NutritionGroup] ✅ Created "${group.name}" by ${req.user?.fullName}`);
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/nutrition-groups/:id - Sửa NDD (admin)
router.put('/:id', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    const { name, ownerId, ownerName, address, isActive } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (ownerId !== undefined) updateData.ownerId = ownerId;
    if (ownerName !== undefined) updateData.ownerName = ownerName;
    if (address !== undefined) updateData.address = address;
    if (isActive !== undefined) updateData.isActive = isActive;

    const group = await NutritionGroup.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    console.log(`[NutritionGroup] ✅ Updated "${group.name}"`);
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/nutrition-groups/:id - Xóa NDD (admin)
router.delete('/:id', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    const group = await NutritionGroup.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });
    console.log(`[NutritionGroup] ✅ Deleted "${group.name}"`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nutrition-groups/:id/join-request - Gửi yêu cầu chuyển NDD
router.post('/:id/join-request', async (req: Request, res: Response) => {
  try {
    const targetGroup = await NutritionGroup.findById(req.params.id);
    if (!targetGroup) return res.status(404).json({ message: 'Không tìm thấy NDD' });
    if (!targetGroup.isActive) return res.status(400).json({ message: 'NDD này hiện không hoạt động' });

    const user = await User.findById(req.user!.userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    // Kiểm tra nếu đã ở NDD này rồi
    if (user.nutritionGroupId && user.nutritionGroupId.toString() === req.params.id) {
      return res.status(400).json({ message: 'Bạn đã là thành viên của NDD này' });
    }

    // Kiểm tra yêu cầu đang chờ
    const pendingExists = targetGroup.pendingMembers.some(
      (p: any) => p.userId.toString() === req.user!.userId
    );
    if (pendingExists) {
      return res.status(400).json({ message: 'Bạn đã gửi yêu cầu trước đó. Vui lòng chờ phê duyệt.' });
    }

    // Lưu NDD hiện tại trước khi chuyển
    const fromGroupId = user.nutritionGroupId || null;

    // Thêm vào pendingMembers
    targetGroup.pendingMembers.push({
      userId: user._id,
      fromNutritionGroupId: fromGroupId,
      requestedAt: new Date(),
    });
    await targetGroup.save();

    // Cập nhật pendingNutritionGroupId cho user
    user.pendingNutritionGroupId = targetGroup._id;
    await user.save();

    console.log(`[NutritionGroup] 📥 Join request: @${user.username} -> "${targetGroup.name}"`);
    res.json({ success: true, message: 'Yêu cầu chuyển NDD đã được gửi. Vui lòng chờ chủ vận hành phê duyệt.' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nutrition-groups/:id/cancel-request - Hủy yêu cầu
router.post('/:id/cancel-request', async (req: Request, res: Response) => {
  try {
    const targetGroup = await NutritionGroup.findById(req.params.id);
    if (!targetGroup) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    targetGroup.pendingMembers = targetGroup.pendingMembers.filter(
      (p: any) => p.userId.toString() !== req.user!.userId
    );
    await targetGroup.save();

    const user = await User.findById(req.user!.userId);
    if (user) {
      user.pendingNutritionGroupId = null;
      await user.save();
    }

    res.json({ success: true, message: 'Đã hủy yêu cầu chuyển NDD.' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nutrition-groups/:id/approve/:userId - Duyệt yêu cầu (chủ vận hành)
router.post('/:id/approve/:userId', async (req: Request, res: Response) => {
  try {
    const group = await NutritionGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    // Kiểm tra quyền: admin hoặc chủ vận hành
    const isOwner = group.ownerId.toString() === req.user!.userId;
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền duyệt yêu cầu này' });
    }

    const pendingItem = group.pendingMembers.find(
      (p: any) => p.userId.toString() === req.params.userId
    );
    if (!pendingItem) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    // Xóa khỏi NDD cũ nếu có
    if (user.nutritionGroupId) {
      const oldGroup = await NutritionGroup.findById(user.nutritionGroupId);
      if (oldGroup) {
        oldGroup.members = oldGroup.members.filter(
          (m: any) => m.toString() !== req.params.userId
        );
        await oldGroup.save();
      }
    }

    // Thêm vào NDD mới
    if (!group.members.includes(user._id)) {
      group.members.push(user._id);
    }

    // Xóa khỏi pending
    group.pendingMembers = group.pendingMembers.filter(
      (p: any) => p.userId.toString() !== req.params.userId
    );
    await group.save();

    // Cập nhật user
    user.nutritionGroupId = group._id;
    user.pendingNutritionGroupId = null;
    await user.save();

    console.log(`[NutritionGroup] ✅ Approved: @${user.username} -> "${group.name}"`);
    res.json({ success: true, message: `Đã phê duyệt @${user.username} vào ${group.name}` });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nutrition-groups/:id/reject/:userId - Từ chối yêu cầu
router.post('/:id/reject/:userId', async (req: Request, res: Response) => {
  try {
    const group = await NutritionGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    const isOwner = group.ownerId.toString() === req.user!.userId;
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền từ chối yêu cầu này' });
    }

    group.pendingMembers = group.pendingMembers.filter(
      (p: any) => p.userId.toString() !== req.params.userId
    );
    await group.save();

    const user = await User.findById(req.params.userId);
    if (user) {
      user.pendingNutritionGroupId = null;
      await user.save();
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nutrition-groups/:id/remove-member/:userId - Xóa hội viên
router.post('/:id/remove-member/:userId', async (req: Request, res: Response) => {
  try {
    const group = await NutritionGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    const isOwner = group.ownerId.toString() === req.user!.userId;
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa hội viên' });
    }

    group.members = group.members.filter((m: any) => m.toString() !== req.params.userId);
    await group.save();

    const user = await User.findById(req.params.userId);
    if (user) {
      user.nutritionGroupId = null;
      await user.save();
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/nutrition-groups/mine - Lấy NDD của user hiện tại
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.userId).populate('nutritionGroupId', 'name ownerName address');
    const groupData = user?.nutritionGroupId ? {
      id: (user.nutritionGroupId as any)._id,
      name: (user.nutritionGroupId as any).name,
      ownerName: (user.nutritionGroupId as any).ownerName,
      address: (user.nutritionGroupId as any).address,
    } : null;

    // Lấy thông tin pending nếu có
    let pendingData = null;
    if (user?.pendingNutritionGroupId) {
      const pendingGroup = await NutritionGroup.findById(user.pendingNutritionGroupId).select('name');
      if (pendingGroup) {
        pendingData = { id: pendingGroup._id, name: pendingGroup.name };
      }
    }

    res.json({ group: groupData, pendingGroup: pendingData });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;