import { Group } from '../models/Group.ts';
import { RESOURCES, ROLE_PERMISSIONS } from '../config/permissions.ts';
import { UserRole } from '../../types.ts';

/**
 * Tính toán permissions hiệu dụng cho user
 * Công thức: EffectivePermissions = RoleDefaults ∪ UserSpecificPermissions ∪ GroupPermissions
 * 
 * @param userId - ID của user
 * @param role - Role của user (MEMBER, COACH, ADMIN)
 * @param userPermissions - Permissions riêng của user (từ User.permissions)
 * @returns Mảng permissions đã được gộp, loại bỏ trùng lặp
 */
export async function getEffectivePermissions(
  userId: string,
  role: string,
  userPermissions: string[]
): Promise<string[]> {
  // ADMIN luôn có tất cả
  if (role === UserRole.ADMIN) {
    return Object.values(RESOURCES).flatMap(r => Object.values(r));
  }

  // 1. Role defaults
  const roleDefaults = ROLE_PERMISSIONS[role as UserRole] || [];

  // 2. User-specific permissions (ghi đè từ admin)
  const specificPerms = userPermissions || [];

  // 3. Group permissions (nếu user thuộc group nào đó)
  let groupPermissions: string[] = [];
  try {
    const groups = await Group.find({
      members: userId,
      isActive: true
    }).select('permissions');
    
    groupPermissions = groups.flatMap(g => g.permissions || []);
  } catch (err: any) {
    console.error(`[PermissionService] Error fetching groups: ${err.message}`);
  }

  // Gộp tất cả và loại bỏ trùng lặp
  const effective = [...new Set([...roleDefaults, ...specificPerms, ...groupPermissions])];
  
  console.log(`[PermissionService] Effective perms for ${userId}: ${effective.length} permissions`);
  return effective;
}

/**
 * Kiểm tra user có quyền cụ thể không (sync, không cần await)
 * Dùng cho client-side hoặc check nhanh không cần tính group
 */
export function hasPermission(
  role: string,
  userPermissions: string[],
  requiredPermission: string
): boolean {
  if (role === UserRole.ADMIN) return true;
  
  const roleDefaults = ROLE_PERMISSIONS[role as UserRole] || [];
  const combined = [...new Set([...roleDefaults, ...(userPermissions || [])])];
  
  return combined.includes(requiredPermission);
}