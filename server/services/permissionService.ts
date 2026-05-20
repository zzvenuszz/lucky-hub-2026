import { Group } from '../models/Group.ts';

/**
 * Tính toán permissions hiệu dụng cho user
 * Công thức: EffectivePermissions = UserSpecificPermissions ∪ GroupPermissions
 * 
 * @param userId - ID của user
 * @param role - Role của user (KHÔNG còn dùng cho permissions)
 * @param userPermissions - Permissions riêng của user (từ User.permissions)
 * @returns Mảng permissions đã được gộp từ groups, loại bỏ trùng lặp
 */
export async function getEffectivePermissions(
  userId: string,
  role: string,
  userPermissions: string[]
): Promise<string[]> {
  // User-specific permissions
  const specificPerms = userPermissions || [];

  // Group permissions (nếu user thuộc group nào đó)
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

  // Gộp và loại bỏ trùng lặp
  const effective = [...new Set([...specificPerms, ...groupPermissions])];
  
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
  const combined = [...new Set([...(userPermissions || [])])];
  return combined.includes(requiredPermission);
}
