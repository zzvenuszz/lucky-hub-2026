import { Request, Response, NextFunction } from 'express';
import { ActiveSession } from '../models/ActiveSession.ts';
import { User } from '../models/User.ts';
import { getEffectivePermissions } from '../services/permissionService.ts';

// Mở rộng type Request để thêm user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        groupName?: string;
        permissions: string[];
        fullName: string;
        email: string;
        username: string;
      };
    }
  }
}

/**
 * Middleware xác thực session
 * Yêu cầu header: Authorization: Bearer <sessionId>
 * Gắn req.user nếu session hợp lệ
 * Cho phép request đi tiếp (các middleware sau có thể từ chối dựa trên permissions)
 * Nếu token không hợp lệ → 401
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Thiếu token xác thực',
        reason: 'no_token'
      });
    }

    const sessionId = authHeader.substring(7); // Bỏ "Bearer "
    
    if (!sessionId || sessionId.length < 10) {
      return res.status(401).json({ 
        message: 'Token không hợp lệ',
        reason: 'invalid_token'
      });
    }

    // Tìm session
    const session = await ActiveSession.findOne({ 
      sessionId, 
      isActive: true 
    });

    if (!session) {
      return res.status(401).json({ 
        message: 'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.',
        reason: 'session_invalidated'
      });
    }

    // Update lastPing không đồng bộ - không block request
    // Dùng updateOne() thay vì save() để tránh load full document
    ActiveSession.updateOne(
      { _id: session._id },
      { $set: { lastPing: new Date() } }
    ).catch((err: any) => {
      console.error(`[Auth] Failed to update lastPing: ${err.message}`);
    });

    // Lấy thông tin user
    const user = await User.findById(session.userId).select('groupId groupName fullName email username status');
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Người dùng không tồn tại',
        reason: 'user_not_found'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ 
        message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên.',
        reason: 'account_suspended'
      });
    }

    // Lấy permissions từ group (có cache TTL)
    const effectivePermissions = await getEffectivePermissions(
      String(user._id)
    );

    // Gắn user info vào request
    req.user = {
      userId: String(user._id),
      groupName: (user as any).groupName || '',
      permissions: effectivePermissions,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
    };

    // Chỉ log auth trong debug mode (giảm 90% log noise)
    // console.log(`[Auth] ✅ Verified: ${user.fullName} (@${user.username}) - ${effectivePermissions.length} permissions`);
    next();
  } catch (err: any) {
    console.error(`[Auth] ❌ Error: ${err.message}`);
    return res.status(500).json({ 
      message: 'Lỗi xác thực',
      reason: 'internal_error'
    });
  }
}

/**
 * Middleware xác thực tùy chọn - không bắt buộc có token
 * Nếu có token hợp lệ thì gắn req.user, nếu không thì vẫn cho qua
 * Dùng cho các route công cộng nhưng muốn biết user đăng nhập hay không
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const sessionId = authHeader.substring(7);
    if (!sessionId || sessionId.length < 10) {
      next();
      return;
    }

    const session = await ActiveSession.findOne({ sessionId, isActive: true });
    if (!session) {
      next();
      return;
    }

    const user = await User.findById(session.userId).select('groupId groupName fullName email username status');
    if (user && user.status === 'ACTIVE') {
      const { getEffectivePermissions } = await import('../services/permissionService.ts');
      const effectivePermissions = await getEffectivePermissions(String(user._id));
      req.user = {
        userId: String(user._id),
        groupName: (user as any).groupName || '',
        permissions: effectivePermissions,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
      };
    }
    next();
  } catch {
    next(); // Bỏ qua lỗi, cho request đi tiếp
  }
}