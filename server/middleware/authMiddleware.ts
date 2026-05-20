import { Request, Response, NextFunction } from 'express';
import { ActiveSession } from '../models/ActiveSession.ts';
import { User } from '../models/User.ts';

// Mở rộng type Request để thêm user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
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

    // Cập nhật lastPing
    session.lastPing = new Date();
    await session.save();

    // Lấy thông tin user
    const user = await User.findById(session.userId).select('role permissions fullName email username status');
    
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

    // Gắn user info vào request
    req.user = {
      userId: (user._id as string).toString(),
      role: user.role,
      permissions: user.permissions || [],
      fullName: user.fullName,
      email: user.email,
      username: user.username,
    };

    console.log(`[Auth] ✅ Verified: ${user.fullName} (@${user.username})`);
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

    const user = await User.findById(session.userId).select('role permissions fullName email username status');
    if (user && user.status === 'ACTIVE') {
      req.user = {
        userId: (user._id as string).toString(),
        role: user.role,
        permissions: user.permissions || [],
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