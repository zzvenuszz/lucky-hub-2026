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
import { AuditLogType, UserRole } from '../../types.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { cryptoUtils } from '../../src/utils/cryptoUtils.ts';
import { uploadToImgBB } from '../utils/imageUtils.ts';

// Import models để đảm bảo chúng được register với Mongoose trước khi dùng mongoose.model()
import '../models/Group.ts';
import '../models/NutritionGroup.ts';
import '../models/NutritionBranch.ts';

const router = Router();

// Tất cả user routes đều cần auth
router.use(authMiddleware);

// GET /api/users/me - Thông tin user hiện tại (refresh permissions từ Groups)
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

    const userObj = user.toObject();
    
    // Sử dụng effective permissions từ authMiddleware (đã gộp Group)
    // req.user.permissions đã được tính trong authMiddleware
    res.json({
      ...userObj,
      id: user._id,
      permissions: req.user!.permissions,
      sessionId: req.headers.authorization?.substring(7) || '',
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
        .select('_id fullName username avatar email role');
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
    const allUsers = await User.find({ status: 'ACTIVE' }).select('_id fullName username avatar email phoneNumber permissions');
    const candidates: any[] = [];
    for (const u of allUsers) {
      const perms = await getEffectivePermissions(
        (u._id as string).toString(),
        '',  // role không còn dùng
        u.permissions || []
      );
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

// PUT /api/users/:id - Cập nhật user
router.put('/:id',
  requirePermission(RESOURCES.USERS.UPDATE),
  async (req: Request, res: Response) => {
    try {
      const data = req.body;
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

      if (data.avatar) {
        data.avatarHash = cryptoUtils.generateAvatarHash(data.avatar);
      }

      const u = await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password');
      if (!u) return res.status(404).json({ message: 'User not found' });

      const result = u.toObject();
      res.json({ ...result, id: u._id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

      if (user.role === UserRole.ADMIN) {
        const adminCount = await User.countDocuments({ role: UserRole.ADMIN });
        if (adminCount <= 1) {
          return res.status(400).json({ message: 'Không thể xóa quản trị viên cuối cùng' });
        }
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

export default router;