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

  // Lấy user để biết groupId
  let groupPermissions: string[] = [];
  try {
    const user = await User.findById(userId).select('groupId');
    if (user && user.groupId) {
      const group = await Group.findById(user.groupId).select('permissions');
      if (group) {
        groupPermissions = group.permissions || [];
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
