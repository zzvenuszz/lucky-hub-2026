import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/User.ts';
import { Metric } from '../models/Metric.ts';
import { Goal } from '../models/Goal.ts';
import { Notification } from '../models/Notification.ts';
import { Post } from '../models/Post.ts';
import { Chat } from '../models/Chat.ts';
import { ActiveSession } from '../models/ActiveSession.ts';
import { PasswordResetToken } from '../models/PasswordResetToken.ts';
import { LoginAttempt } from '../models/LoginAttempt.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { Group } from '../models/Group.ts';
import { InventoryItem, InventoryLot, InventoryMovement, Sale } from '../models/Inventory.ts';
import { AuditLogType } from '../../types.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { cryptoUtils } from '../../src/utils/cryptoUtils.ts';
import { uploadToImgBB } from '../utils/imageUtils.ts';

// Import models để đảm bảo chúng được register với Mongoose trước khi dùng mongoose.model()
import '../models/NutritionGroup.ts';
import '../models/NutritionBranch.ts';

const router = Router();

const linkPendingSponsorMembers = async (sponsor: any): Promise<{ linkedCount: number; skippedCycleCount: number }> => {
  const sponsorNumber = String(sponsor?.memberNumber || '').trim().toUpperCase();
  if (!sponsor?._id || !sponsorNumber) return { linkedCount: 0, skippedCycleCount: 0 };

  const pendingMembers = await User.find({ sponsorMemberNumber: sponsorNumber, sponsorUserId: null, _id: { $ne: sponsor._id } })
    .select('_id fullName')
    .lean() as any[];
  let linkedCount = 0;
  let skippedCycleCount = 0;

  for (const member of pendingMembers) {
    const memberId = String(member._id);
    let cursor: any = sponsor;
    const visited = new Set<string>();
    let createsCycle = false;
    while (cursor?.sponsorUserId) {
      const ancestorId = String(cursor.sponsorUserId);
      if (ancestorId === memberId) { createsCycle = true; break; }
      if (visited.has(ancestorId)) { createsCycle = true; break; }
      visited.add(ancestorId);
      cursor = await User.findById(ancestorId).select('sponsorUserId').lean();
    }
    if (createsCycle) { skippedCycleCount += 1; continue; }

    const result = await User.updateOne(
      { _id: member._id, sponsorMemberNumber: sponsorNumber, sponsorUserId: null },
      { $set: { sponsorUserId: sponsor._id } },
    );
    if (result.modifiedCount > 0) linkedCount += 1;
  }

  return { linkedCount, skippedCycleCount };
};

// Tất cả user routes đều cần auth
router.use(authMiddleware);

// GET /api/users/me - Thông tin user hiện tại (refresh permissions từ Groups)
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    const userObj: any = user.toObject();
    const userGroup = user.groupId
      ? await Group.findById(user.groupId).select('name permissions').lean()
      : null;
    const canSell =
      req.user!.permissions.includes(RESOURCES.INVENTORY.SELL) ||
      req.user!.permissions.includes(RESOURCES.INVENTORY.MANAGE);
    if (!canSell) {
      delete userObj.bankName;
      delete userObj.bankAccountNumber;
    }
    
    // Sử dụng effective permissions từ authMiddleware (đã gộp Group)
    // req.user.permissions đã được tính trong authMiddleware
    res.json({
      ...userObj,
      id: user._id,
      groupName: userGroup?.name || '',
      groupPermissions: req.user!.permissions,
      permissions: req.user!.permissions,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users - Danh sách users (tất cả user đã đăng nhập đều xem được)
// Nếu có quyền users:view thì trả đủ thông tin, nếu không thì chỉ basic info
router.get('/', async (req: Request, res: Response) => {
  try {
    const hasFullView = req.user?.permissions?.includes(RESOURCES.USERS.VIEW);
    
    if (hasFullView) {
      // Admin: xem tất cả thông tin (trừ password)
      const u = await User.find().select('-password');
      return res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
    } else {
      // User thường: chỉ xem thông tin cơ bản
      const u = await User.find({ status: 'ACTIVE' })
        .select('_id fullName username avatar email groupId groupName');
      return res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
    }
  } catch (err: any) {
    console.error('[UserRoutes] Error fetching users:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/users/coach-candidates - Danh sách user có quyền coach:access (cho NDD)
router.get('/coach-candidates', async (req: Request, res: Response) => {
  try {
    const { getEffectivePermissions } = await import('../services/permissionService.ts');
    const allUsers = await User.find({ status: 'ACTIVE' }).select('_id fullName username avatar email phoneNumber groupId');
    const candidates: any[] = [];
    for (const u of allUsers) {
      const perms = await getEffectivePermissions(String(u._id));
      if (perms.includes(RESOURCES.COACH.ACCESS)) {
        candidates.push({ ...u.toObject(), id: u._id });
      }
    }
    console.log(`[UserRoutes] Coach candidates: ${candidates.length} users`);
    res.json(candidates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/sponsor-tree/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user!.permissions.includes(RESOURCES.SPONSOR_TREE.VIEW)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem tuyến bảo trợ.' });
    }
    const targetId = req.params.id;
    if (targetId !== req.user!.userId && !req.user!.permissions.includes(RESOURCES.METRICS.VIEW_ANY)) {
      return res.status(403).json({ message: 'Bạn chỉ được xem tuyến bảo trợ của hồ sơ mình có quyền xem.' });
    }

    let cursor: any = await User.findById(targetId).select('_id fullName memberNumber memberLevel sponsorUserId sponsorMemberNumber').lean();
    if (!cursor) return res.status(404).json({ message: 'Không tìm thấy hội viên.' });

    const chain: any[] = [cursor];
    const visited = new Set<string>([String(cursor._id)]);
    let pendingSponsorNumber = '';
    while (cursor.sponsorUserId) {
      const sponsorId = String(cursor.sponsorUserId);
      if (visited.has(sponsorId)) {
        console.warn('[SponsorTree] Cycle detected while loading upline:', { targetId, sponsorId });
        return res.status(409).json({ message: 'Tuyến bảo trợ có dữ liệu vòng lặp, không thể hiển thị sơ đồ.' });
      }
      visited.add(sponsorId);
      const sponsor = await User.findById(sponsorId).select('_id fullName memberNumber memberLevel sponsorUserId sponsorMemberNumber').lean();
      if (!sponsor) {
        pendingSponsorNumber = String(cursor.sponsorMemberNumber || '').trim().toUpperCase();
        break;
      }
      chain.push(sponsor);
      cursor = sponsor;
    }
    if (!cursor.sponsorUserId && cursor.sponsorMemberNumber) pendingSponsorNumber = String(cursor.sponsorMemberNumber).trim().toUpperCase();

    const nodes = chain.reverse().map(member => ({
      id: String(member._id),
      fullName: String(member.fullName || '').trim() || 'Hội viên',
      memberNumber: String(member.memberNumber || '').trim(),
      memberLevel: member.memberLevel || 'customer',
    }));
    console.log('[SponsorTree] Upline loaded:', { actorId: req.user!.userId, targetId, nodeCount: nodes.length, hasPendingSponsor: Boolean(pendingSponsorNumber) });
    res.json({ nodes, pendingSponsorNumber });
  } catch (error: any) {
    console.error('[SponsorTree] Upline lookup failed:', error);
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/users/:id - Cập nhật user
// - User thường chỉ được sửa hồ sơ của chính mình
// - Admin có quyền users:update mới được sửa hồ sơ người khác
router.put('/:id',
  async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const isSelf = targetId === req.user!.userId;
      const hasUpdatePerm = req.user?.permissions?.includes(RESOURCES.USERS.UPDATE);

      // Chỉ cho phép nếu: user tự sửa hồ sơ của mình, HOẶC có quyền users:update
      if (!isSelf && !hasUpdatePerm) {
        console.log(`[Permission] ❌ ${req.user!.fullName} denied: users:update (self=${isSelf})`);
        return res.status(403).json({
          message: 'Bạn không có quyền thực hiện thao tác này',
          reason: 'forbidden',
          requiredPermissions: [RESOURCES.USERS.UPDATE]
        });
      }

      console.log(`[Permission] ✅ ${req.user!.fullName} allowed update user ${targetId} (self=${isSelf})`);

      const data = { ...req.body };
      let previousSponsorNumber = '';
      const allowedFields = ['fullName', 'email', 'phoneNumber', 'address', 'birthDate', 'height', 'weight', 'gender', 'healthGoals', 'avatar', 'password'];
      const actorCanSell =
        req.user?.permissions?.includes(RESOURCES.INVENTORY.SELL) ||
        req.user?.permissions?.includes(RESOURCES.INVENTORY.MANAGE);
      if (actorCanSell || hasUpdatePerm) {
        allowedFields.push('bankName', 'bankAccountNumber');
      }
      if (hasUpdatePerm) allowedFields.push('username', 'status', 'memberNumber', 'sponsorMemberNumber');
      for (const key of Object.keys(data)) {
        if (!allowedFields.includes(key)) delete data[key];
      }
      if ((isSelf || hasUpdatePerm) && ('memberNumber' in req.body || 'sponsorMemberNumber' in req.body)) {
        const previousProfile = await User.findById(targetId).select('sponsorMemberNumber').lean();
        previousSponsorNumber = previousProfile?.sponsorMemberNumber || '';
        if ('memberNumber' in req.body) {
          const memberNumber = String(req.body.memberNumber ?? '').trim().toUpperCase();
          const validMemberNumber = (value: string) => !value || /^(VA\d{8}|VNY\d{7})$/.test(value);
          if (!validMemberNumber(memberNumber)) return res.status(400).json({ message: 'Mã hội viên không đúng định dạng.' });
          if (memberNumber) {
            const duplicate = await User.findOne({ memberNumber, _id: { $ne: targetId } }).select('_id');
            if (duplicate) return res.status(409).json({ message: 'Mã hội viên đã được sử dụng.' });
            data.memberNumber = memberNumber;
            const currentUser = await User.findById(targetId).select('memberLevel').lean();
            const canManageMemberLevels = req.user!.permissions.includes(RESOURCES.MEMBER_LEVEL.MANAGE_ANY);
            if ((isSelf || canManageMemberLevels) && (!currentUser?.memberLevel || currentUser.memberLevel === 'customer')) data.memberLevel = 'member';
          } else {
            const currentUser = await User.findById(targetId).select('memberLevel').lean();
            const canManageMemberLevels = req.user!.permissions.includes(RESOURCES.MEMBER_LEVEL.MANAGE_ANY);
            if (!isSelf && !canManageMemberLevels && currentUser?.memberLevel !== 'customer') {
              return res.status(403).json({ message: 'Cần quyền quản lý cấp độ toàn cục để gỡ mã của hội viên đang ở cấp cao hơn Khách hàng.' });
            }
            data.memberNumber = '';
            if (isSelf || canManageMemberLevels) data.memberLevel = 'customer';
          }
        }
        if ('sponsorMemberNumber' in req.body) {
          const sponsorNumber = String(req.body.sponsorMemberNumber ?? '').trim().toUpperCase();
          const validMemberNumber = (value: string) => !value || /^(VA\d{8}|VNY\d{7})$/.test(value);
          if (!validMemberNumber(sponsorNumber)) return res.status(400).json({ message: 'Mã người bảo trợ không đúng định dạng.' });
          const requestedMemberNumber = String(req.body.memberNumber ?? '').trim().toUpperCase();
          if (sponsorNumber && 'memberNumber' in req.body && sponsorNumber === requestedMemberNumber) {
            return res.status(400).json({ message: 'Không thể dùng mã hội viên của chính mình làm mã người bảo trợ.' });
          }
          if (sponsorNumber) {
            const sponsor = await User.findOne({ memberNumber: sponsorNumber }).select('_id memberNumber');
            if (sponsor) {
              if (String(sponsor._id) === String(targetId)) return res.status(400).json({ message: 'Không thể tự bảo trợ chính mình.' });
              let cursor: any = sponsor;
              const seen = new Set<string>([String(targetId)]);
              while (cursor?.sponsorUserId) {
                const id = String(cursor.sponsorUserId);
                if (seen.has(id)) return res.status(400).json({ message: 'Quan hệ người bảo trợ tạo thành vòng lặp.' });
                seen.add(id);
                cursor = await User.findById(id).select('sponsorUserId').lean();
              }
              data.sponsorUserId = sponsor._id;
              data.sponsorMemberNumber = sponsorNumber;
            } else {
              data.sponsorUserId = null;
              data.sponsorMemberNumber = sponsorNumber;
              console.log('[UserRoutes] Sponsor number saved pending registration:', { targetId, sponsorNumber });
            }
          } else {
            data.sponsorUserId = null;
            data.sponsorMemberNumber = '';
          }
        }
      }
      if (data.avatar && data.avatar.startsWith('data:image')) {
        const imgData = await uploadToImgBB(data.avatar);
        if (imgData) {
          data.avatar = imgData.url;
        }
      }

      if (data.password && data.password.trim() !== '') {
        data.password = crypto.createHash('sha256').update(data.password).digest('hex');
        data.isPasswordEncrypted = true;
      } else {
        delete data.password;
      }

      if ('avatar' in data) {
        data.avatarHash = data.avatar ? cryptoUtils.generateAvatarHash(data.avatar) : '';
      }

      console.log('[UserRoutes] Applying profile update:', { actorId: req.user!.userId, targetId, fields: Object.keys(data) });
      const u = await User.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).select('-password');
      if (!u) return res.status(404).json({ message: 'User not found' });

      const result = u.toObject();
      if (u.memberNumber) {
        try {
          const linkResult = await linkPendingSponsorMembers(u);
          if (linkResult.linkedCount || linkResult.skippedCycleCount) {
            console.log('[UserRoutes] Pending sponsor links processed:', { sponsorId: String(u._id), linkedCount: linkResult.linkedCount, skippedCycleCount: linkResult.skippedCycleCount });
          }
        } catch (linkError) {
          console.error('[UserRoutes] Pending sponsor linking failed:', { sponsorId: String(u._id), error: linkError });
        }
      }
      if ((isSelf || hasUpdatePerm) && 'sponsorMemberNumber' in req.body) {
        const log = new AuditLog({ actorId: req.user!.userId, actorName: req.user!.fullName, targetId: String(u._id), targetName: u.fullName, type: 'SPONSOR_UPDATE', details: `Người bảo trợ ${previousSponsorNumber || 'không có'} → ${u.sponsorMemberNumber || 'không có'}`, timestamp: new Date().toISOString() });
        await log.save();
      }
      const { getEffectivePermissions } = await import('../services/permissionService.ts');
      const effectivePermissions = isSelf ? req.user!.permissions : await getEffectivePermissions(String(u._id));
      const targetCanSell =
        effectivePermissions.includes(RESOURCES.INVENTORY.SELL) ||
        effectivePermissions.includes(RESOURCES.INVENTORY.MANAGE);
      if (!targetCanSell) {
        delete (result as any).bankName;
        delete (result as any).bankAccountNumber;
      }
      const userGroup = u.groupId
        ? await Group.findById(u.groupId).select('name permissions').lean()
        : null;
      console.log(`[UserRoutes] Updated user ${u._id}, permissions=${effectivePermissions.length}`);
      res.json({
        ...result,
        id: u._id,
        groupName: userGroup?.name || (result as any).groupName || '',
        groupPermissions: effectivePermissions,
        permissions: effectivePermissions,
      });
    } catch (err: any) {
      const duplicateField = Object.keys(err.keyPattern || {})[0];
      const duplicateMessage = duplicateField === 'memberNumber' ? 'Mã hội viên đã được sử dụng.' : duplicateField === 'email' ? 'Email đã được sử dụng.' : duplicateField === 'username' ? 'Tên đăng nhập đã được sử dụng.' : 'Thông tin bị trùng lặp.';
      res.status(err.code === 11000 ? 409 : 500).json({ message: err.code === 11000 ? duplicateMessage : err.message });
    }
  }
);

// DELETE /api/users/:id - Xóa user
router.delete('/:id',
  requirePermission(RESOURCES.USERS.DELETE),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

      // Kiểm tra user có quyền admin (từ group) trước khi xóa
      try {
        const GroupModel = mongoose.model('Group');
        const userGroup = user.groupId ? await GroupModel.findById(user.groupId) : null;
        const isAdmin = userGroup?.permissions?.includes(RESOURCES.ADMIN.PANEL);
        if (isAdmin) {
          const adminGroups = await GroupModel.find({ permissions: RESOURCES.ADMIN.PANEL });
          let adminCount = 0;
          for (const g of adminGroups) {
            const groupAdminCount = await User.collection.countDocuments({
              groupId: { $in: [g._id, String(g._id)] }
            });
            adminCount += groupAdminCount;
            console.log(`[UserRoutes] Admin delete check: group=${g.name}, users=${groupAdminCount}`);
          }
          if (adminCount <= 1) {
            return res.status(400).json({ message: 'Không thể xóa quản trị viên cuối cùng' });
          }
        }
      } catch (e: any) {
        console.error('[UserRoutes] Failed to check admin count:', e.message);
      }

      // Xóa tất cả dữ liệu liên quan
      await Metric.deleteMany({ userId });
      await Goal.deleteMany({ userId });
      await Notification.deleteMany({ userId });
      await Post.deleteMany({ userId });
      await Chat.deleteMany({ memberId: userId });
      await Chat.deleteMany({ coachId: userId });
      await ActiveSession.deleteMany({ userId });
      await PasswordResetToken.deleteMany({ userId });
      await LoginAttempt.deleteMany({ $or: [{ identifier: user.email }, { identifier: user.username }] });

      // Xóa user khỏi Group hệ thống
      try {
        const GroupModel = mongoose.model('Group');
        await GroupModel.updateMany(
          { members: userId },
          { $pull: { members: userId } }
        );
      } catch (e: any) {
        console.error('[UserRoutes] Failed to remove from Group:', e.message);
      }

      // Xóa user khỏi NutritionGroup (members, coOwners, pendingMembers)
      try {
        const NGModel = mongoose.model('NutritionGroup');
        await NGModel.updateMany(
          {},
          { $pull: { members: userId, coOwners: userId, 'pendingMembers': { userId: userId } } }
        );
      } catch (e: any) {
        console.error('[UserRoutes] Failed to remove from NutritionGroup:', e.message);
      }

      // Xóa userId khỏi NutritionBranch memberIds
      try {
        const NBModel = mongoose.model('NutritionBranch');
        await NBModel.updateMany(
          {},
          { $pull: { memberIds: userId } }
        );
      } catch (e: any) {
        console.error('[UserRoutes] Failed to remove from NutritionBranch:', e.message);
      }

      const log = new AuditLog({
        actorId: req.user?.userId || 'admin',
        actorName: req.user?.fullName || 'Admin',
        targetId: userId,
        targetName: user.fullName,
        type: AuditLogType.REGISTER,
        details: `Xóa người dùng: @${user.username} (${user.fullName})`,
        timestamp: new Date().toISOString()
      });
      await log.save();
      console.log(`[UserRoutes] Audit log created for user deletion: ${user.fullName} (${userId})`);

      await User.findByIdAndDelete(userId);
      console.log(`[UserRoutes] ✅ User deleted: @${user.username} (${userId})`);

      res.json({ success: true, message: 'Đã xóa người dùng thành công' });
    } catch (err: any) {
      console.error(`[UserRoutes] Delete error: ${err.message}`);
      res.status(500).json({ message: err.message });
    }
  }
);

// POST /api/users/:id/send-reset-email - Gửi email reset password
router.post('/:id/send-reset-email',
  requirePermission(RESOURCES.USERS.UPDATE),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const tokenDoc = new PasswordResetToken({
        userId: user._id,
        token: resetToken,
        email: user.email,
        expiresAt
      });
      await tokenDoc.save();

      const { emailService } = await import('../../services/emailService.ts');
      let emailSent = false;
      if (emailService && typeof emailService.sendPasswordResetEmail === 'function') {
        emailSent = await emailService.sendPasswordResetEmail(user.email, resetToken, user.fullName);
      }

      if (emailSent) {
        const log = new AuditLog({
          actorId: req.user?.userId || 'admin',
          actorName: req.user?.fullName || 'Admin',
          targetId: userId,
          targetName: user.fullName,
          type: AuditLogType.LOGIN,
          details: `Admin gửi email khôi phục mật khẩu cho @${user.username}`,
          timestamp: new Date().toISOString()
        });
        await log.save();

        res.json({ success: true, message: 'Email khôi phục mật khẩu đã được gửi.' });
      } else {
        res.status(500).json({ success: false, message: 'Không thể gửi email.' });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }
);

// DELETE /api/users/:id/inventory-data - Xóa toàn bộ dữ liệu tồn kho và hóa đơn của một user
router.delete('/:id/inventory-data',
  requirePermission([RESOURCES.USERS.DELETE, RESOURCES.USERS.UPDATE]),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
      }
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

      const normalizeConfirmPhrase = (val: string) =>
        String(val || '')
          .normalize('NFC')
          .replace(/XOÁ/g, 'XÓA')
          .replace(/xoá/g, 'xóa')
          .replace(/\s+/g, ' ')
          .trim();
      const confirmationText = normalizeConfirmPhrase(req.body?.confirmationText);
      const expectedWithSpace = normalizeConfirmPhrase(`XÁC NHẬN XÓA DỮ LIỆU ${user.username}`);
      const expectedWithoutSpace = normalizeConfirmPhrase(`XÁC NHẬN XÓA DỮ LIỆU${user.username}`);
      if (confirmationText !== expectedWithSpace && confirmationText !== expectedWithoutSpace) {
        return res.status(400).json({
          message: `Chuỗi xác nhận không khớp. Vui lòng nhập chính xác: ${expectedWithSpace}`,
        });
      }

      console.log('[UserRoutes] Resetting inventory and sales data for user:', {
        actorId: req.user?.userId,
        targetUserId: userId,
        username: user.username,
      });

      const [salesDel, lotsDel, movementsDel, itemsReset] = await Promise.all([
        Sale.deleteMany({ ownerId: user._id }),
        InventoryLot.deleteMany({ ownerId: user._id }),
        InventoryMovement.deleteMany({ ownerId: user._id }),
        InventoryItem.updateMany({ ownerId: user._id }, { $set: { quantity: 0 } }),
      ]);

      const log = new AuditLog({
        actorId: req.user?.userId || 'admin',
        actorName: req.user?.fullName || 'Admin',
        targetId: userId,
        targetName: user.fullName,
        type: AuditLogType.REGISTER,
        details: `Admin xóa toàn bộ tồn kho (${itemsReset.modifiedCount || 0} SP về 0, ${lotsDel.deletedCount || 0} lô, ${movementsDel.deletedCount || 0} nhật ký) và ${salesDel.deletedCount || 0} hóa đơn của @${user.username} (${user.fullName})`,
        timestamp: new Date().toISOString(),
      });
      await log.save();

      console.log('[UserRoutes] ✅ Inventory and sales data reset completed:', {
        targetUserId: userId,
        username: user.username,
        deletedSalesCount: salesDel.deletedCount || 0,
        deletedLotsCount: lotsDel.deletedCount || 0,
        deletedMovementsCount: movementsDel.deletedCount || 0,
        resetItemsCount: itemsReset.modifiedCount || 0,
      });

      res.json({
        success: true,
        message: `Đã xóa toàn bộ tồn kho và ${salesDel.deletedCount || 0} hóa đơn của @${user.username}.`,
        deletedSalesCount: salesDel.deletedCount || 0,
        deletedLotsCount: lotsDel.deletedCount || 0,
        deletedMovementsCount: movementsDel.deletedCount || 0,
        resetItemsCount: itemsReset.modifiedCount || 0,
      });
    } catch (err: any) {
      console.error('[UserRoutes] Reset user inventory data error:', err.message);
      res.status(500).json({ message: err.message || 'Không thể xóa dữ liệu kho và hóa đơn.' });
    }
  }
);

export default router;
