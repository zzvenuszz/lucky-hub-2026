import { User } from '../models/User.ts';
import { Group } from '../models/Group.ts';
import mongoose from 'mongoose';

// Cache permissions với TTL 60 giây
const permissionsCache = new Map<string, { permissions: string[]; expiresAt: number }>();
const CACHE_TTL = 60000; // 60 seconds

/**
 * Xóa cache permissions của user (gọi khi group membership thay đổi)
 */
export function clearPermissionCache(userId: string): void {
  permissionsCache.delete(userId);
}

/**
 * Xóa toàn bộ cache permissions
 */
export function clearAllPermissionCache(): void {
  permissionsCache.clear();
}

/**
 * Tính toán permissions hiệu dụng cho user
 * Chỉ dựa trên Group permissions - KHÔNG còn user-specific permissions
 * 
 * @param userId - ID của user
 * @returns Mảng permissions từ group của user
 */
export async function getEffectivePermissions(
  userId: string
): Promise<string[]> {
  // Kiểm tra cache trước
  const cached = permissionsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  // Lấy user để biết groupId (fallback qua Group.members nếu groupId chưa đồng bộ)
  let groupPermissions: string[] = [];
  try {
    const user = await User.findById(userId).select('groupId');
    let group: any = null;
    if (user && user.groupId) {
      group = await Group.findById(user.groupId).select('name permissions isActive');
    }
    if (!group && user) {
      group = await Group.findOne({ members: user._id, isActive: true }).select('_id name permissions isActive');
      if (group?._id) {
        await User.updateOne({ _id: user._id }, { $set: { groupId: group._id } });
      }
    }
    if (group && group.isActive !== false) {
      groupPermissions = group.permissions || [];
      const groupNameLower = String(group.name || '').trim().toLowerCase();
      const isAdminGroup =
        groupNameLower === 'administrator' ||
        groupNameLower === 'admin' ||
        groupNameLower === 'quản trị viên' ||
        groupPermissions.includes('admin:panel');
      if (isAdminGroup && !groupPermissions.includes('users:upgrade_member')) {
        groupPermissions = [...groupPermissions, 'users:upgrade_member'];
      }
    }
  } catch (err: any) {
    console.error(`[PermissionService] Error fetching group: ${err.message}`);
  }

  // Lưu vào cache
  permissionsCache.set(userId, {
    permissions: groupPermissions,
    expiresAt: Date.now() + CACHE_TTL
  });

  return groupPermissions;
}
