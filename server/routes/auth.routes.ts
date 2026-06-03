import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/User.ts';
import { LoginAttempt } from '../models/LoginAttempt.ts';
import { ActiveSession } from '../models/ActiveSession.ts';
import { PasswordResetToken } from '../models/PasswordResetToken.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { AuditLogType, AccountStatus } from '../../types.ts';
import { cryptoUtils } from '../../src/utils/cryptoUtils.ts';
import { uploadToImgBB } from '../utils/imageUtils.ts';
import { validateBody, sanitizeText } from '../../services/validationService.ts';
import { Group } from '../models/Group.ts';
import { NutritionGroup } from '../models/NutritionGroup.ts';
import { Notification } from '../models/Notification.ts';

const router = Router();

// Hàm hash password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Hủy session cũ
async function invalidateOldSessions(userId: string, newSessionId: string, newDevice: string) {
  const oldSessions = await ActiveSession.find({
    userId,
    isActive: true,
    sessionId: { $ne: newSessionId }
  });

  for (const session of oldSessions) {
    session.isActive = false;
    await session.save();
  }
  return oldSessions.length;
}

// Email service
let emailService: any;

// POST /api/check-email
router.post('/check-email', async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  res.json({ exists: !!user });
});

// POST /api/register
router.post('/register', validateBody(
  { field: 'username', type: 'username', required: true },
  { field: 'email', type: 'email', required: true },
  { field: 'password', type: 'password', required: true },
  { field: 'fullName', type: 'string', required: true, min: 2, max: 100 }
), async (req: Request, res: Response) => {
  if (req.body.fullName) req.body.fullName = sanitizeText(req.body.fullName);
  try {
    const { username, email, password, avatar, ...rest } = req.body;
    const imgData = await uploadToImgBB(avatar);
    const finalAvatar = imgData?.url || avatar;
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Đếm tổng user và tìm group
    const totalUsers = await User.countDocuments();
    const [defaultGroup, adminGroup] = await Promise.all([
      Group.findOne({ isDefault: true, isActive: true }),
      Group.findOne({ name: 'Quản trị viên', isActive: true })
    ]);

    // Người đầu tiên vào group Quản trị viên, còn lại vào group mặc định
    let assignedGroupId = defaultGroup?._id || null;
    if (totalUsers === 0 && adminGroup) {
      assignedGroupId = adminGroup._id;
    }

    const nutritionGroupId = rest.nutritionGroupId || null;
    const newUser = new User({
      ...rest,
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password: hashPassword(password),
      groupId: assignedGroupId,
      isPasswordEncrypted: true,
      avatar: finalAvatar,
      avatarHash: cryptoUtils.generateAvatarHash(finalAvatar),
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
      nutritionGroupId,
    });
    await newUser.save();

    // Gửi email thông tin đăng ký (KHÔNG gửi password qua email vì lý do bảo mật)
    try {
      if (emailService && typeof emailService.sendRegistrationEmail === 'function') {
        await emailService.sendRegistrationEmail(
          newUser.email,
          newUser.fullName,
          newUser.username
        );
        console.log(`[Auth] 📧 Registration email sent to ${newUser.email}`);
      } else {
        console.warn(`[Auth] Email service not ready, skipping registration email`);
      }
    } catch (emailErr: any) {
      console.warn(`[Auth] Failed to send registration email:`, emailErr.message);
    }

    // Gửi yêu cầu tham gia NDD (pending, không auto-add)
    if (nutritionGroupId) {
      try {
        const ndd = await NutritionGroup.findById(nutritionGroupId);
        if (ndd && ndd.isActive) {
          // Kiểm tra xem user đã có pending chưa
          const alreadyPending = ndd.pendingMembers?.some(
            (p: any) => p.userId?.toString() === newUser._id.toString()
          );
          if (!alreadyPending) {
            // Thêm vào pendingMembers bằng $push updateOne để tránh lỗi type
            await NutritionGroup.updateOne(
              { _id: ndd._id },
              {
                $push: {
                  pendingMembers: {
                    userId: newUser._id,
                    requestedAt: new Date(),
                  },
                },
              }
            );
            console.log(`[Auth] ⏳ User @${newUser.username} sent join request to NDD "${ndd.name}" (pending approval)`);

            // Gửi notification cho owner và co-owners
            const notifyTargets = [ndd.ownerId, ...(ndd.coOwners || [])];
            for (const targetId of notifyTargets) {
              if (targetId) {
                try {
                  const notif = new Notification({
                    userId: targetId,
                    type: 'system',
                    message: `📋 ${newUser.fullName} (@${newUser.username}) đã gửi yêu cầu tham gia NDD "${ndd.name}". Vui lòng xét duyệt.`,
                    link: `/admin/ndd/${ndd._id}/members`,
                    actorId: newUser._id,
                    actorName: newUser.fullName,
                  });
                  await notif.save();
                } catch (notifErr: any) {
                  console.warn(`[Auth] Could not send notification to NDD owner:`, notifErr.message);
                }
              }
            }
          }
        }
      } catch (nddErr: any) {
        console.warn(`[Auth] Could not add pending to NDD:`, nddErr.message);
      }
    }

    // Audit Log
    const log = new AuditLog({
      actorId: newUser._id, actorName: newUser.fullName, type: AuditLogType.REGISTER,
      details: `Đăng ký tài khoản mới: @${newUser.username}`, timestamp: new Date().toISOString()
    });
    await log.save();

    res.json({ message: 'Success', emailSent: true });
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
});

// POST /api/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const identifier = username.toLowerCase().trim();
    const now = new Date();

    let attempt = await LoginAttempt.findOne({ identifier });

    if (attempt && attempt.lockUntil && attempt.lockUntil > now) {
      const remainingMs = attempt.lockUntil.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return res.status(429).json({
        message: `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${remainingMinutes} phút.`,
        locked: true,
        remainingMinutes,
        lockUntil: attempt.lockUntil.toISOString()
      });
    }

    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }]
    });

    if (!user || user.password !== hashPassword(password)) {
      if (!attempt) {
        attempt = new LoginAttempt({ identifier, count: 1, lastAttempt: now });
      } else {
        attempt.count = (attempt.count || 0) + 1;
        attempt.lastAttempt = now;
      }

      if (attempt.count >= 5) {
        const blockIndex = Math.floor(attempt.count / 5);
        let lockMinutes: number;
        if (blockIndex === 1) lockMinutes = 1;
        else lockMinutes = Math.min(1 + (blockIndex - 1) * 5, 60);
        attempt.lockUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
      }

      await attempt.save();
      const remainingAttempts = 5 - (attempt.count % 5 || 5);

      return res.status(401).json({
        message: 'Sai thông tin đăng nhập',
        remainingAttempts,
        locked: attempt.lockUntil ? true : false,
        lockUntil: attempt.lockUntil?.toISOString() || null
      });
    }

    // Đăng nhập thành công
    if (attempt) {
      await LoginAttempt.deleteOne({ identifier });
    }

    if (user.status === AccountStatus.SUSPENDED) {
      return res.status(403).json({
        message: "Tài khoản của bạn bị lỗi. Vui lòng liên hệ với Quản trị viên hệ thống hoặc Nhóm dinh dưỡng bạn đang sinh hoạt để được hỗ trợ."
      });
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    const invalidatedCount = await invalidateOldSessions(user._id.toString(), sessionId, userAgent);

    const activeSession = new ActiveSession({
      userId: user._id,
      sessionId,
      device: userAgent.substring(0, 200),
      ip,
      isActive: true,
      lastPing: now
    });
    await activeSession.save();

    const u = user.toObject();
    delete u.password;
    
    // Lấy group permissions từ groupId duy nhất
    let groupPerms: string[] = [];
    let groupName: string = '';
    try {
      if (user.groupId) {
        const userGroup = await Group.findById(user.groupId).select('permissions name');
        if (userGroup) {
          groupPerms = userGroup.permissions || [];
          groupName = userGroup.name;
        }
      }
    } catch (groupErr: any) {
      console.warn(`[Auth] Could not load group permissions:`, groupErr.message);
    }

    // Kiểm tra user có quyền quản lý NDD
    let isNddManager = false;
    try {
      const nddCount = await NutritionGroup.countDocuments({
        $or: [
          { ownerId: user._id },
          { coOwners: user._id }
        ],
        isActive: true
      });
      isNddManager = nddCount > 0;
    } catch (nddErr: any) {
      console.warn(`[Auth] Could not check NDD ownership:`, nddErr.message);
    }

    res.json({
      ...u,
      id: user._id,
      email: user.email,
      sessionId,
      groupId: user.groupId,
      groupName,
      groupPermissions: groupPerms,
      permissions: groupPerms,
      isNddManager,
      invalidatedOldSessions: invalidatedCount
    });
  } catch (err) {
    console.error(`[Login] Error:`, err);
    res.status(500).json({ message: 'Lỗi hệ thống' });
  }
});

// POST /api/session/ping
router.post('/session/ping', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(401).json({ valid: false, message: 'Thiếu sessionId' });
    }

    const session = await ActiveSession.findOne({ sessionId, isActive: true });
    if (!session) {
      return res.status(401).json({
        valid: false,
        message: 'Session đã hết hạn hoặc bị hủy do đăng nhập từ thiết bị khác.',
        reason: 'session_invalidated'
      });
    }

    session.lastPing = new Date();
    await session.save();
    res.json({ valid: true });
  } catch (err: any) {
    console.error(`[Session] Ping error:`, err.message);
    res.status(500).json({ valid: false, message: 'Lỗi hệ thống' });
  }
});

// POST /api/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email là bắt buộc' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.json({ message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const tokenDoc = new PasswordResetToken({
      userId: user._id,
      token: resetToken,
      email: user.email,
      expiresAt
    });
    await tokenDoc.save();

    if (emailService && typeof emailService.sendPasswordResetEmail === 'function') {
      await emailService.sendPasswordResetEmail(user.email, resetToken, user.fullName);
    }

    const log = new AuditLog({
      actorId: user._id, actorName: user.fullName,
      type: AuditLogType.LOGIN,
      details: `Yêu cầu đặt lại mật khẩu cho email: ${user.email}`,
      timestamp: new Date().toISOString()
    });
    await log.save();

    res.json({ message: 'Hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn.' });
  } catch (err: any) {
    console.error(`[FORGOT-PASSWORD] Error: ${err.message}`);
    res.status(500).json({ message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
  }
});

// POST /api/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Token và mật khẩu mới là bắt buộc' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });

    const tokenDoc = await PasswordResetToken.findOne({ token, used: false, expiresAt: { $gt: new Date() } });
    if (!tokenDoc) return res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });

    const user = await User.findById(tokenDoc.userId);
    if (!user) return res.status(404).json({ message: 'Người dùng không tồn tại' });

    user.password = hashPassword(newPassword);
    user.isPasswordEncrypted = true;
    await user.save();

    await LoginAttempt.deleteOne({ identifier: user.email });
    await LoginAttempt.deleteOne({ identifier: user.username });

    tokenDoc.used = true;
    await tokenDoc.save();

    res.json({ message: 'Mật khẩu đã được đặt lại thành công. Bạn có thể đăng nhập với mật khẩu mới.' });
  } catch (err: any) {
    console.error(`[RESET-PASSWORD] Error: ${err.message}`);
    res.status(500).json({ message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
  }
});

// GET /api/verify-reset-token/:token
router.get('/verify-reset-token/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const tokenDoc = await PasswordResetToken.findOne({ token, used: false, expiresAt: { $gt: new Date() } });
    if (!tokenDoc) return res.status(400).json({ valid: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
    res.json({ valid: true, email: tokenDoc.email });
  } catch (err: any) {
    res.status(500).json({ valid: false, message: 'Lỗi hệ thống' });
  }
});

// GET /api/verify-email/:token
router.get('/verify-email/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ message: 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.' });

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: 'Xác thực email thành công! Bạn có thể đăng nhập và sử dụng đầy đủ chức năng.' });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
  }
});

// POST /api/resend-verification
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email là bắt buộc' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json({ message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được email xác thực.' });
    if (user.isEmailVerified) return res.json({ message: 'Email này đã được xác thực. Bạn có thể đăng nhập.' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = verificationExpires;
    await user.save();

    if (emailService && typeof emailService.sendVerificationEmail === 'function') {
      await emailService.sendVerificationEmail(user.email, verificationToken, user.fullName);
    }

    res.json({ message: 'Email xác thực đã được gửi. Vui lòng kiểm tra hộp thư đến.' });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi hệ thống.' });
  }
});

export function setEmailService(service: any) {
  emailService = service;
}

export default router;