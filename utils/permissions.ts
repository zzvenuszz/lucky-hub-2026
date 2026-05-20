import { UserRole } from '../types.ts';

/**
 * Client-side permission checking utility
 * 
 * Cách dùng:
 *   import { can } from './utils/permissions.ts';
 *   if (can(currentUser, 'metrics:update:any')) { ... }
 */

type PermissionMap = {
  [key: string]: string[];
};

// Permissions mặc định cho từng role (client-side copy để check nhanh)
// Sync với server/config/permissions.ts
const ROLE_PERMISSIONS: PermissionMap = {
  [UserRole.MEMBER]: [
    'metrics:view:own', 'metrics:create:own', 'metrics:update:own',
    'posts:view', 'posts:create', 'posts:update:own', 'posts:delete:own',
    'chat:view', 'chat:send',
  ],
  [UserRole.COACH]: [
    'metrics:view:own', 'metrics:create:own', 'metrics:update:own',
    'metrics:view:any', 'metrics:create:any', 'metrics:update:any', 'metrics:delete:any',
    'users:view',
    'posts:view', 'posts:create', 'posts:update:own', 'posts:delete:own',
    'chat:view', 'chat:send',
    'ai:view',
  ],
  [UserRole.ADMIN]: [
    'metrics:view:own', 'metrics:create:own', 'metrics:update:own',
    'metrics:view:any', 'metrics:create:any', 'metrics:update:any', 'metrics:delete:any',
    'users:view', 'users:create', 'users:update', 'users:delete',
    'ai:manage', 'ai:view',
    'groups:manage',
    'system:config', 'system:logs',
    'admin:panel',
    'posts:view', 'posts:create', 'posts:update:own', 'posts:update:any', 'posts:delete:own', 'posts:delete:any',
    'chat:view', 'chat:send',
  ],
};

/**
 * Kiểm tra user có quyền cụ thể không
 * 
 * @param user - User object (có thể undefined)
 * @param permission - Permission string (ví dụ: 'metrics:view:any')
 * @returns boolean
 */
export function can(user: { role?: string; permissions?: string[] } | null | undefined, permission: string): boolean {
  if (!user) return false;
  
  // ADMIN luôn có tất cả quyền
  if (user.role === UserRole.ADMIN) return true;
  
  // Kiểm tra permissions riêng (được tính từ server khi login)
  if (user.permissions?.includes(permission)) return true;
  
  // Fallback: kiểm tra role defaults
  const roleDefaults = ROLE_PERMISSIONS[user.role || ''] || [];
  return roleDefaults.includes(permission);
}

/**
 * Kiểm tra user có tất cả quyền được liệt kê không (AND)
 */
export function canAll(user: { role?: string; permissions?: string[] } | null | undefined, permissions: string[]): boolean {
  return permissions.every(p => can(user, p));
}

/**
 * Kiểm tra user có ít nhất 1 trong các quyền được liệt kê không (OR)
 */
export function canAny(user: { role?: string; permissions?: string[] } | null | undefined, permissions: string[]): boolean {
  return permissions.some(p => can(user, p));
}

/**
 * Lấy danh sách quyền hiệu dụng của user
 */
export function getEffectivePermissions(user: { role?: string; permissions?: string[] } | null | undefined): string[] {
  if (!user) return [];
  if (user.role === UserRole.ADMIN) {
    // Trả về tất cả quyền
    return Object.values(ROLE_PERMISSIONS).flat();
  }
  
  const roleDefaults = ROLE_PERMISSIONS[user.role || ''] || [];
  const userPerms = user.permissions || [];
  return [...new Set([...roleDefaults, ...userPerms])];
}