import { Router, Request, Response } from 'express';
import { Group } from '../models/Group.ts';
import { User } from '../models/User.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { PERMISSION_DESCRIPTIONS } from '../config/permissions.ts';
import { clearPermissionCache, clearAllPermissionCache } from '../services/permissionService.ts';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission(RESOURCES.GROUPS.MANAGE));

const isAdminProtectedGroup = (group: { name?: string; permissions?: string[] } | null | undefined): boolean => {
  if (!group) return false;
  const nameLower = String(group.name || '').trim().toLowerCase();
  return (
    nameLower === 'administrator' ||
    nameLower === 'admin' ||
    nameLower === 'quản trị viên' ||
    Boolean((group.permissions || []).includes(RESOURCES.ADMIN.PANEL))
  );
};

// GET /api/admin/groups - Danh sách nhóm
router.get('/', async (req: Request, res: Response) => {
  try {
    const groups = await Group.find().populate('members', 'fullName username email avatar').sort({ priority: 1, createdAt: -1 });
    res.json(groups.map(g => {
      const obj: any = g.toObject();
      const isProtected = isAdminProtectedGroup(obj);
      const perms = Array.isArray(obj.permissions) ? [...obj.permissions] : [];
      if (isProtected && !perms.includes(RESOURCES.USERS.UPGRADE_MEMBER)) {
        perms.push(RESOURCES.USERS.UPGRADE_MEMBER);
      }
      return {
        ...obj,
        id: g._id,
        permissions: perms,
        priority: isProtected ? 0 : (typeof obj.priority === 'number' ? obj.priority : 10),
        allowMemberUpgrade: Boolean(obj.allowMemberUpgrade),
        isProtectedAdmin: isProtected,
      };
    }));
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
    const { name, description, permissions, isDefault, allowMemberUpgrade, priority } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên nhóm là bắt buộc' });
    }

    const existing = await Group.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Tên nhóm đã tồn tại' });
    }

    // Nếu là default, unset các group default khác
    if (isDefault) {
      await Group.updateMany({ isDefault: true }, { isDefault: false });
    }

    const isProtected = isAdminProtectedGroup({ name: name.trim(), permissions });
    const parsedPriority = Number.isInteger(Number(priority)) && Number(priority) >= 0 ? Number(priority) : 10;
    const finalPermissions: string[] = Array.isArray(permissions) ? [...permissions] : [];
    if (isProtected && !finalPermissions.includes(RESOURCES.USERS.UPGRADE_MEMBER)) {
      finalPermissions.push(RESOURCES.USERS.UPGRADE_MEMBER);
    }

    const group = new Group({
      name: name.trim(),
      description: description || '',
      permissions: finalPermissions,
      createdBy: req.user!.userId,
      isActive: true,
      isDefault: !!isDefault,
      allowMemberUpgrade: Boolean(allowMemberUpgrade),
      priority: isProtected ? 0 : Math.max(1, parsedPriority),
    });
    await group.save();

    console.log(`[Groups] ✅ Created group "${group.name}" (priority=${group.priority}, allowUpgrade=${group.allowMemberUpgrade}) by ${req.user?.fullName}`);
    res.json({ ...group.toObject(), id: group._id, isProtectedAdmin: isProtected });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/groups/:id - Cập nhật nhóm
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existingGroup = await Group.findById(req.params.id);
    if (!existingGroup) return res.status(404).json({ message: 'Không tìm thấy nhóm' });

    const isProtected = isAdminProtectedGroup(existingGroup);
    const { name, description, permissions, isActive, isDefault, allowMemberUpgrade, priority } = req.body;

    if (isProtected && name !== undefined && name.trim() !== existingGroup.name) {
      return res.status(400).json({ message: 'Nhóm Administrator được bảo vệ, không cho phép đổi tên.' });
    }
    if (isProtected && priority !== undefined && Number(priority) !== 0) {
      return res.status(400).json({ message: 'Nhóm Administrator mặc định có Priority 0 và không thể thay đổi.' });
    }

    const updateData: any = {};
    if (name !== undefined && !isProtected) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) {
      const nextPerms: string[] = Array.isArray(permissions) ? [...permissions] : [];
      if (isProtected && !nextPerms.includes(RESOURCES.USERS.UPGRADE_MEMBER)) {
        nextPerms.push(RESOURCES.USERS.UPGRADE_MEMBER);
      }
      if (isProtected && !nextPerms.includes(RESOURCES.ADMIN.PANEL)) {
        nextPerms.push(RESOURCES.ADMIN.PANEL);
      }
      updateData.permissions = nextPerms;
    }
    if (isActive !== undefined) updateData.isActive = isProtected ? true : isActive;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (allowMemberUpgrade !== undefined) updateData.allowMemberUpgrade = Boolean(allowMemberUpgrade);
    if (isProtected) {
      updateData.priority = 0;
    } else if (priority !== undefined) {
      const parsedPriority = Number(priority);
      if (!Number.isInteger(parsedPriority) || parsedPriority < 0) {
        return res.status(400).json({ message: 'Priority phải là số nguyên không âm (0, 1, 2, 3...).' });
      }
      updateData.priority = parsedPriority;
    }

    // Nếu set làm default, unset các group default khác
    if (isDefault === true) {
      await Group.updateMany({ _id: { $ne: req.params.id }, isDefault: true }, { isDefault: false });
    }

    const group = await Group.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm' });

    // Clear cache cho tất cả members của group khi permissions hoặc trạng thái thay đổi
    if (permissions !== undefined || isActive !== undefined || priority !== undefined || allowMemberUpgrade !== undefined) {
      clearAllPermissionCache();
    }

    console.log(`[Groups] ✅ Updated group "${group.name}" (priority=${group.priority}, allowUpgrade=${group.allowMemberUpgrade}) by ${req.user?.fullName}`);
    res.json({ ...group.toObject(), id: group._id, isProtectedAdmin: isAdminProtectedGroup(group) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/groups/:id/set-default - Đặt nhóm làm mặc định
router.put('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const { isDefault } = req.body; // true = set default, false = unset default

    if (isDefault === true) {
      // Unset tất cả các group default khác
      await Group.updateMany({ _id: { $ne: req.params.id }, isDefault: true }, { isDefault: false });
    }

    const group = await Group.findByIdAndUpdate(req.params.id, { isDefault: !!isDefault }, { new: true });
    if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm' });

    console.log(`[Groups] ✅ ${isDefault ? 'Set' : 'Unset'} default group: "${group.name}" by ${req.user?.fullName}`);
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/groups/:id - Xóa nhóm
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existingGroup = await Group.findById(req.params.id);
    if (!existingGroup) return res.status(404).json({ message: 'Không tìm thấy nhóm' });
    if (isAdminProtectedGroup(existingGroup)) {
      return res.status(400).json({ message: 'Không thể xóa nhóm Administrator được bảo vệ.' });
    }
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

    const normalizedMemberIds = memberIds.filter(Boolean).map((m: any) => String(m._id || m));
    // Lưu danh sách members cũ TRƯỚC KHI ghi đè
    const oldMemberIds = (group.members || []).filter(Boolean).map(m => String(m));

    group.members = normalizedMemberIds as any;
    await group.save();

    // QUAN TRỌNG: Đồng bộ groupId cho tất cả thành viên hiện tại của group
    if (normalizedMemberIds.length > 0) {
      await User.updateMany(
        { _id: { $in: normalizedMemberIds } },
        { $set: { groupId: group._id } }
      );
      console.log(`[Groups] ✅ Synced groupId for ${normalizedMemberIds.length} members in "${group.name}"`);
    }

    // User bị xóa khỏi group: chỉ set groupId = null nếu đang trỏ tới chính group này
    const removedMemberIds = oldMemberIds.filter(mId => !normalizedMemberIds.includes(mId));
    if (removedMemberIds.length > 0) {
      await User.updateMany(
        { _id: { $in: removedMemberIds }, groupId: group._id },
        { $set: { groupId: null } }
      );
      console.log(`[Groups] ℹ️ Cleared groupId for ${removedMemberIds.length} removed members from "${group.name}"`);
    }

    // Clear cache cho tất cả members khi có thay đổi
    clearAllPermissionCache();

    const populatedGroup = await Group.findById(group._id).populate('members', 'fullName username email avatar');
    console.log(`[Groups] ✅ Updated members for group "${group.name}": ${normalizedMemberIds.length} members`);
    res.json({ ...populatedGroup!.toObject(), id: populatedGroup!._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/groups/user/:userId - Lấy nhóm của user
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const targetUser = await User.findById(req.params.userId).select('groupId').lean();
    const query: any = {
      isActive: true,
      $or: [
        { members: req.params.userId },
        ...(targetUser?.groupId ? [{ _id: targetUser.groupId }] : []),
      ],
    };
    const groups = await Group.find(query).select('name permissions');
    res.json(groups.map(g => ({ ...g.toObject(), id: g._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;