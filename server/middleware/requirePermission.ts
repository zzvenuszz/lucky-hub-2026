import { Request, Response, NextFunction } from 'express';
import { getEffectivePermissions } from '../services/permissionService.ts';

/**
 * Middleware kiểm tra quyền
 * Sử dụng: requirePermission('metrics:view:any')
 * Sử dụng nhiều: requirePermission(['metrics:view:any', 'metrics:update:any'])
 * Nếu có nhiều quyền: mặc định là OR (chỉ cần 1 trong các quyền)
 * 
 * @param permissions - Một hoặc nhiều quyền cần kiểm tra
 * @param mode - 'or' (mặc định): chỉ cần 1 trong các quyền, 'and': cần tất cả
 */
export function requirePermission(
  permissions: string | string[],
  mode: 'or' | 'and' = 'or'
) {
  const perms = Array.isArray(permissions) ? permissions : [permissions];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          message: 'Cần đăng nhập để thực hiện thao tác này',
          reason: 'not_authenticated'
        });
      }

      // Tính permissions hiệu dụng (role + user-specific + groups)
      const effectivePermissions = await getEffectivePermissions(req.user.userId, req.user.role, req.user.permissions);

      // Kiểm tra quyền
      const hasPermission = mode === 'or'
        ? perms.some(p => effectivePermissions.includes(p))
        : perms.every(p => effectivePermissions.includes(p));

      if (!hasPermission) {
        console.log(`[Permission] ❌ ${req.user.fullName} denied: ${perms.join(', ')} (mode: ${mode})`);
        return res.status(403).json({ 
          message: 'Bạn không có quyền thực hiện thao tác này',
          reason: 'forbidden',
          requiredPermissions: perms
        });
      }

      console.log(`[Permission] ✅ ${req.user.fullName} allowed: ${perms.join(', ')}`);
      next();
    } catch (err: any) {
      console.error(`[Permission] ❌ Error: ${err.message}`);
      return res.status(500).json({ 
        message: 'Lỗi kiểm tra quyền',
        reason: 'internal_error'
      });
    }
  };
}

/**
 * Helper kiểm tra nhanh trong route handler
 * @example if (!can(req.user, 'metrics:update:any')) { return 403 }
 */
export function can(user: Express.Request['user'] | undefined, permission: string): boolean {
  if (!user) return false;
  // Chỉ check permissions (đã được gộp từ groups khi login)
  return user.permissions.includes(permission);
}
