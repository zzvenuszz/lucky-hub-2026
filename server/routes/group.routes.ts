import { Router, Request, Response } from 'express';
import { Group } from '../models/Group.ts';
import { User } from '../models/User.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { PERMISSION_DESCRIPTIONS } from '../config/permissions.ts';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission(RESOURCES.GROUPS.MANAGE));

// GET /api/admin/groups - Danh sách nhóm
router.get('/', async (req: Request, res: Response) => {
  try {
    const groups = await Group.find().populate('members', 'fullName username email role avatar').sort({ createdAt: -1 });
    res.json(groups.map(g => ({ ...g.toObject(), id: g._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/groups/permissions-list - Danh sách tất cả permissions có thể gán
router.get('/permissions-list', async (req: Request, res: Response) => {
  try {
    const permissions = Object.entries(PERMISSION_DESCRIPTIONS).map(([key, description]) => ({
      key,
      description,
    }));
    res.json(permissions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/groups - Tạo nhóm mới
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên nhóm là bắt buộc' });
    }

    const existing = await Group.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Tên nhóm đã tồn tại' });
    }

    const group = new Group({
      name: name.trim(),
      description: description || '',
      permissions: permissions || [],
      createdBy: req.user!.userId,
      isActive: true,
    });
    await group.save();

    console.log(`[Groups] ✅ Created group "${group.name}" by ${req.user?.fullName}`);
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/groups/:id - Cập nhật nhóm
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, permissions, isActive } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (isActive !== undefined) updateData.isActive = isActive;

    const group = await Group.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm' });

    console.log(`[Groups] ✅ Updated group "${group.name}" by ${req.user?.fullName}`);
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/groups/:id - Xóa nhóm
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm' });

    console.log(`[Groups] ✅ Deleted group "${group.name}" by ${req.user?.fullName}`);
    res.json({ success: true, message: 'Đã xóa nhóm' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/groups/:id/members - Thêm/xóa thành viên
router.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const { memberIds } = req.body; // Array of userIds
    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ message: 'Danh sách thành viên không hợp lệ' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm' });

    group.members = memberIds;
    await group.save();

    const populatedGroup = await Group.findById(group._id).populate('members', 'fullName username email role avatar');
    console.log(`[Groups] ✅ Updated members for group "${group.name}": ${memberIds.length} members`);
    res.json({ ...populatedGroup!.toObject(), id: populatedGroup!._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/groups/user/:userId - Lấy nhóm của user
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const groups = await Group.find({
      members: req.params.userId,
      isActive: true
    }).select('name permissions');
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;