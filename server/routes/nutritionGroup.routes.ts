import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { NutritionGroup } from '../models/NutritionGroup.ts';
import { Metric } from '../models/Metric.ts';
import { User } from '../models/User.ts';
import { authMiddleware, optionalAuth } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { Group } from '../models/Group.ts';

const router = Router();

// GET /api/nutrition-groups/public - Danh sách NDD active (không cần auth - cho Register)
router.get('/public', async (req: Request, res: Response) => {
  try {
    const groups = await NutritionGroup.find({ isActive: true })
      .select('name address members')
      .sort({ name: 1 });
    res.json(groups.map(g => ({ 
      ...g.toObject(), 
      id: g._id,
      memberCount: g.members?.length || 0,
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// All routes below require auth
router.use(authMiddleware);

// GET /api/nutrition-groups - Danh sách NDD đang hoạt động (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const groups = await NutritionGroup.find({ isActive: true })
      .populate('ownerId', 'fullName username')
      .populate('coOwners', 'fullName username')
      .select('name ownerId ownerName address members coOwners')
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

// GET /api/nutrition-groups/all - Tất cả NDD
router.get('/all', async (req: Request, res: Response) => {
  try {
    const groups = await NutritionGroup.find()
      .populate('ownerId', 'fullName username groupId groupName')
      .populate('coOwners', 'fullName username groupId groupName')
      .populate('members', 'fullName username email phoneNumber groupId groupName avatar')
      .populate('pendingMembers.userId', 'fullName username')
      .sort({ createdAt: -1 });
    res.json(groups.map(g => {
      const obj = g.toObject();
      // Transform ownerId và coOwners từ object sang string để client dùng
      return { 
        ...obj, 
        id: g._id,
        ownerId: (obj.ownerId as any)?._id || obj.ownerId,
        coOwners: (obj.coOwners || []).map((c: any) => c._id || c),
      };
    }));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/nutrition-groups/my-dashboard - Dashboard NDD cho HLV (trả về mảng)
router.get('/my-dashboard', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    console.log(`[NutritionGroup] 🔍 my-dashboard request from userId="${userId}" (type: ${typeof userId}) length=${userId.length}`);

    // 🛠️ FIX: Sử dụng string comparison thay vì ObjectId
    // Vì ownerId/coOwners/members có thể được lưu dưới dạng string (không phải ObjectId)
    // khi admin tạo NDD từ front-end gửi userId dạng string
    const allGroups = await NutritionGroup.find({ isActive: true })
      .populate('ownerId', 'fullName username groupId groupName')
      .populate('coOwners', 'fullName username groupId groupName')
      .populate('members', 'fullName username email phoneNumber groupId groupName avatar')
      .populate('pendingMembers.userId', 'fullName username groupId groupName avatar')
      .sort({ createdAt: -1 });

    console.log(`[NutritionGroup] 📋 Total active NDDs in DB: ${allGroups.length}`);

    // ===== DEBUG: Log tất cả NDD + ownerId để so sánh =====
    console.log(`[NutritionGroup] 🔎 DEBUG: Listing all NDDs in DB:`);
    for (let i = 0; i < allGroups.length; i++) {
      const ndd = allGroups[i];
      const ownerRaw = ndd.ownerId as any;
      const ownerIdVal = ownerRaw?._id?.toString() || ownerRaw?.toString() || 'EMPTY';
      const ownerType = typeof ownerRaw;
      console.log(`[NutritionGroup]   [${i}] NDD="${ndd.name}"`);
      console.log(`[NutritionGroup]         ownerId raw type=${ownerType} value="${ownerIdVal}"`);
      console.log(`[NutritionGroup]         ownerId (typeof) = ${typeof ndd.ownerId}`);
      console.log(`[NutritionGroup]         ownerId === userId? ${ownerIdVal === userId}`);
      console.log(`[NutritionGroup]         ownerId String() === String()? ${String(ownerRaw || '') === String(userId)}`);
      console.log(`[NutritionGroup]         coOwners count=${(ndd.coOwners || []).length}`);
      console.log(`[NutritionGroup]         members count=${(ndd.members || []).length}`);
      
      // Test từng cách compare
      const viaToString = ownerIdVal === userId;
      const viaString = String(ownerRaw || '') === String(userId);
      console.log(`[NutritionGroup]         toString match=${viaToString} | String() match=${viaString}`);
    }

    // Filter bằng string comparison để tránh type mismatch ObjectId vs string
    const groups = allGroups.filter(g => {
      // ownerId có thể là object (sau populate) hoặc string/ObjectId
      const ownerIdStr = (g.ownerId as any)?._id?.toString() || g.ownerId?.toString();
      
      // coOwners là array các ObjectId hoặc object sau populate
      const coOwnersStr = (g.coOwners || []).map((c: any) => c._id?.toString() || c.toString());
      
      // members là array các ObjectId hoặc object sau populate
      const membersStr = (g.members || []).map((m: any) => m._id?.toString() || m.toString());

      const isOwner = ownerIdStr === userId;
      const isCoOwner = coOwnersStr.includes(userId);
      const isMember = membersStr.includes(userId);

      if (isOwner || isCoOwner || isMember) {
        console.log(`[NutritionGroup] 📊 MATCH: "${g.name}" owner=${isOwner} coOwner=${isCoOwner} member=${isMember}`);
      } else {
        console.log(`[NutritionGroup] ❌ NO MATCH: "${g.name}" ownerId="${ownerIdStr}" userId="${userId}"`);
      }

      return isOwner || isCoOwner || isMember;
    });

    console.log(`[NutritionGroup] 📊 Found ${groups.length} groups for userId="${userId}"`);
    if (groups.length === 0) {
      console.log(`[NutritionGroup] ❌ ZERO groups matched!`);
      console.log(`[NutritionGroup]    Possible causes: ownerId is stored as different format (number/string/ObjectId)`);
      console.log(`[NutritionGroup]    Check the DEBUG output above for the actual ownerId format in DB.`);
    }

    // Lấy chỉ số mới nhất cho member của từng group
    const result = await Promise.all(groups.map(async (group) => {
      const memberMetrics: any[] = [];
      for (const member of group.members) {
        const latestMetric = await Metric.findOne({ userId: (member as any)._id }).sort({ date: -1 }).lean();
        memberMetrics.push({
          user: member,
          latestMetric: latestMetric || null,
        });
      }
      return {
        group: { ...group.toObject(), id: group._id },
        memberMetrics,
      };
    }));

    console.log(`[NutritionGroup] ✅ my-dashboard: ${result.length} groups processed`);
    if (result.length === 0) {
      return res.json({ groups: [], message: 'Bạn chưa thuộc NDD nào' });
    }
    res.json({ groups: result, message: null });
  } catch (err: any) {
    console.error(`[NutritionGroup] ❌ my-dashboard error:`, err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/nutrition-groups/:id/members - Chi tiết NDD với member metrics
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const group = await NutritionGroup.findById(req.params.id)
      .populate('ownerId', 'fullName username groupId groupName')
      .populate('coOwners', 'fullName username groupId groupName')
      .populate('members', 'fullName username email phoneNumber groupId groupName avatar');

    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    const memberMetrics: any[] = [];
    for (const member of group.members) {
      const latestMetric = await Metric.findOne({ userId: (member as any)._id }).sort({ date: -1 }).lean();
      memberMetrics.push({
        user: member,
        latestMetric: latestMetric || null,
      });
    }

    res.json({
      group: { ...group.toObject(), id: group._id },
      memberMetrics,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/nutrition-groups - Tạo NDD (admin, chỉ chọn COACH làm owner)
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

    // Kiểm tra owner phải có role COACH
    if (ownerId) {
      const isHlv = await isUserCoach(ownerId);
      if (!isHlv) {
        return res.status(400).json({ message: 'Chủ vận hành phải có vai trò HLV (huấn luyện viên)' });
      }
    }

    const ownerUserId = ownerId || req.user!.userId;

    // Cập nhật nutritionGroupId cho owner ngay khi tạo NDD
    await User.findByIdAndUpdate(ownerUserId, { nutritionGroupId: null, pendingNutritionGroupId: null });

    const group = new NutritionGroup({
      name: name.trim(),
      ownerId: ownerUserId,
      ownerName: ownerName || req.user!.fullName,
      address: address || '',
      members: [ownerUserId],  // Tự động thêm owner vào members
      coOwners: [],
      isActive: true,
      pendingMembers: [],
    });
    await group.save();

    // Đồng bộ user.nutritionGroupId với group._id
    await User.findByIdAndUpdate(ownerUserId, { nutritionGroupId: group._id });

    console.log(`[NutritionGroup] ✅ Created "${group.name}" by ${req.user?.fullName}`);
    console.log(`[NutritionGroup] 🆔 Owner ${ownerUserId} → nutritionGroupId = ${group._id}`);
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Helper: kiểm tra user có quyền Coach (coach:access) không
// Dựa trên hệ thống phân quyền theo group
async function isUserCoach(userId: string): Promise<boolean> {
  try {
    const user = await User.findById(userId).select('groupId');
    if (!user) {
      console.error(`[isUserCoach] ❌ User "${userId}" không tồn tại`);
      return false;
    }
    // Lấy effective permissions từ groups
    const { getEffectivePermissions } = await import('../services/permissionService.ts');
    const effectivePermissions = await getEffectivePermissions(userId);
    const hasCoachAccess = effectivePermissions.includes(RESOURCES.COACH.ACCESS);
    console.log(`[isUserCoach] 🔍 User "${userId}" → ${hasCoachAccess ? '✅ Có quyền' : '❌ Không có quyền'} coach:access (${effectivePermissions.length} permissions)`);
    return hasCoachAccess;
  } catch (err) {
    console.error(`[isUserCoach] ❌ Error:`, err);
    return false;
  }
}

// POST /api/nutrition-groups/:id/co-owners - Thêm/bớt đồng vận hành (owner hoặc admin)
router.post('/:id/co-owners', async (req: Request, res: Response) => {
  try {
    const { coOwnerIds } = req.body; // array of userIds
    const group = await NutritionGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    // Kiểm tra quyền: chủ vận hành hoặc admin
    const isOwner = group.ownerId.toString() === req.user!.userId;
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Chỉ chủ vận hành hoặc admin mới có quyền này' });
    }

    // Validate tất cả đều có role COACH và là member của NDD
    if (coOwnerIds && Array.isArray(coOwnerIds)) {
      for (const id of coOwnerIds) {
        const isHlv = await isUserCoach(id);
        if (!isHlv) {
          return res.status(400).json({ message: 'Đồng vận hành phải có vai trò HLV (huấn luyện viên)' });
        }
        // Kiểm tra người được thêm phải đang là member của NDD
        const isMemberOfGroup = group.members.some((m: any) => m.toString() === id);
        if (!isMemberOfGroup) {
          return res.status(400).json({ message: 'Người được chọn làm đồng vận hành phải đang sinh hoạt trong NDD này' });
        }
      }
      group.coOwners = coOwnerIds;
      // Đồng bộ user.nutritionGroupId cho co-owners
      for (const id of coOwnerIds) {
        await User.findByIdAndUpdate(id, { nutritionGroupId: group._id, pendingNutritionGroupId: null });
        console.log(`[NutritionGroup] 🆔 Co-owner ${id} → nutritionGroupId = ${group._id}`);
      }
    }

    await group.save();
    const populated = await NutritionGroup.findById(group._id)
      .populate('coOwners', 'fullName username');
    res.json({ coOwners: populated?.coOwners || [] });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/nutrition-groups/:id - Sửa NDD (owner, co-owner hoặc admin)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const group = await NutritionGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    // Kiểm tra quyền: chủ, đồng chủ hoặc admin
    const isOwner = group.ownerId.toString() === req.user!.userId;
    const isCoOwner = group.coOwners?.some((c: any) => c.toString() === req.user!.userId);
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    
    if (!isOwner && !isCoOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền sửa NDD này' });
    }

    const { name, ownerId, ownerName, address, isActive } = req.body;
    
    // Chỉ admin hoặc owner mới được đổi chủ vận hành
    if (ownerId !== undefined && !isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Chỉ admin hoặc chủ vận hành mới được đổi chủ' });
    }

    // Kiểm tra owner mới phải có role COACH
    if (ownerId) {
      const isHlv = await isUserCoach(ownerId);
      if (!isHlv) {
        return res.status(400).json({ message: 'Chủ vận hành phải có vai trò HLV (huấn luyện viên)' });
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (ownerId !== undefined) {
      updateData.ownerId = ownerId;
      // Tự động thêm owner mới vào members nếu chưa có
      const memberExists = group.members.some((m: any) => m.toString() === ownerId);
      if (!memberExists) {
        updateData.$push = { members: ownerId };
        console.log(`[NutritionGroup] Auto-added new owner ${ownerId} to members`);
      }
      // Đồng bộ user.nutritionGroupId cho owner mới
      await User.findByIdAndUpdate(ownerId, { nutritionGroupId: group._id, pendingNutritionGroupId: null });
      console.log(`[NutritionGroup] 🆔 New owner ${ownerId} → nutritionGroupId = ${group._id}`);
    }
    if (ownerName !== undefined) updateData.ownerName = ownerName;
    if (address !== undefined) updateData.address = address;
    if (isActive !== undefined && (isAdmin || isOwner)) updateData.isActive = isActive;

    const updated = await NutritionGroup.findByIdAndUpdate(req.params.id, updateData, { new: true });
    console.log(`[NutritionGroup] ✅ Updated "${updated?.name}"`);
    res.json({ ...updated!.toObject(), id: updated!._id });
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

    if (user.nutritionGroupId && user.nutritionGroupId.toString() === req.params.id) {
      return res.status(400).json({ message: 'Bạn đã là thành viên của NDD này' });
    }

    const pendingExists = targetGroup.pendingMembers.some(
      (p: any) => p.userId.toString() === req.user!.userId
    );
    if (pendingExists) {
      return res.status(400).json({ message: 'Bạn đã gửi yêu cầu trước đó. Vui lòng chờ phê duyệt.' });
    }

    const fromGroupId = user.nutritionGroupId || null;
    targetGroup.pendingMembers.push({
      userId: user._id,
      fromNutritionGroupId: fromGroupId,
      requestedAt: new Date(),
    });
    await targetGroup.save();

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

// POST /api/nutrition-groups/:id/approve/:userId - Duyệt yêu cầu (chủ vận hành hoặc admin)
router.post('/:id/approve/:userId', async (req: Request, res: Response) => {
  try {
    const group = await NutritionGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy NDD' });

    const isOwner = group.ownerId.toString() === req.user!.userId;
    const isCoOwner = group.coOwners?.some((c: any) => c.toString() === req.user!.userId);
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    if (!isOwner && !isCoOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền duyệt yêu cầu này' });
    }

    const pendingItem = group.pendingMembers.find(
      (p: any) => p.userId.toString() === req.params.userId
    );
    if (!pendingItem) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    if (user.nutritionGroupId) {
      const oldGroup = await NutritionGroup.findById(user.nutritionGroupId);
      if (oldGroup) {
        oldGroup.members = oldGroup.members.filter((m: any) => m.toString() !== req.params.userId);
        await oldGroup.save();
      }
    }

    if (!group.members.includes(user._id)) {
      group.members.push(user._id);
    }
    group.pendingMembers = group.pendingMembers.filter((p: any) => p.userId.toString() !== req.params.userId);
    await group.save();

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
    const isCoOwner = group.coOwners?.some((c: any) => c.toString() === req.user!.userId);
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    if (!isOwner && !isCoOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền từ chối yêu cầu này' });
    }

    group.pendingMembers = group.pendingMembers.filter((p: any) => p.userId.toString() !== req.params.userId);
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
    const isCoOwner = group.coOwners?.some((c: any) => c.toString() === req.user!.userId);
    const isAdmin = req.user!.permissions.includes(RESOURCES.GROUPS.MANAGE);
    if (!isOwner && !isCoOwner && !isAdmin) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa hội viên' });
    }

    // Chặn xóa chủ vận hành (chỉ admin mới được)
    const targetIsOwner = group.ownerId.toString() === req.params.userId;
    if (targetIsOwner && !isAdmin) {
      return res.status(403).json({ message: 'Không thể xóa chủ vận hành khỏi NDD. Chỉ Admin mới có quyền này.' });
    }

    // Chặn xóa đồng vận hành nếu không phải admin (chỉ admin mới được)
    const targetIsCoOwner = group.coOwners?.some((c: any) => c.toString() === req.params.userId);
    if (targetIsCoOwner && !isAdmin) {
      return res.status(403).json({ message: 'Không thể xóa đồng vận hành khỏi NDD. Chỉ Admin mới có quyền này.' });
    }

    group.members = group.members.filter((m: any) => m.toString() !== req.params.userId);
    await group.save();

    const user = await User.findById(req.params.userId);
    if (user) {
      user.nutritionGroupId = null;
      await user.save();
    }

    console.log(`[NutritionGroup] 🗑️ Removed member ${req.params.userId} from "${group.name}"`);
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