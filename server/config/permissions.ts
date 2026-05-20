import { UserRole } from '../../types.ts';

/**
 * Định nghĩa tất cả resource/actions trong hệ thống
 */
export const RESOURCES = {
  METRICS: {
    VIEW_OWN: 'metrics:view:own',
    CREATE_OWN: 'metrics:create:own',
    UPDATE_OWN: 'metrics:update:own',
    VIEW_ANY: 'metrics:view:any',
    CREATE_ANY: 'metrics:create:any',
    UPDATE_ANY: 'metrics:update:any',
    DELETE_ANY: 'metrics:delete:any',
  },
  USERS: {
    VIEW: 'users:view',
    CREATE: 'users:create',
    UPDATE: 'users:update',
    DELETE: 'users:delete',
  },
  AI: {
    MANAGE: 'ai:manage',
    VIEW: 'ai:view',
  },
  GROUPS: {
    MANAGE: 'groups:manage',
  },
  SYSTEM: {
    CONFIG: 'system:config',
    LOGS: 'system:logs',
  },
  ADMIN: {
    PANEL: 'admin:panel',
  },
  POSTS: {
    VIEW: 'posts:view',
    CREATE: 'posts:create',
    UPDATE_OWN: 'posts:update:own',
    UPDATE_ANY: 'posts:update:any',
    DELETE_OWN: 'posts:delete:own',
    DELETE_ANY: 'posts:delete:any',
  },
  CHATS: {
    SEND: 'chat:send',
    VIEW: 'chat:view',
  },
  COACH: {
    ACCESS: 'coach:access',
  },
} as const;

/**
 * Danh sách tất cả permissions
 */
export const ALL_PERMISSIONS: string[] = Object.values(RESOURCES).flatMap(
  (resource) => Object.values(resource)
);

/**
 * Permissions mặc định cho từng Role
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.MEMBER]: [
    RESOURCES.METRICS.VIEW_OWN,
    RESOURCES.METRICS.CREATE_OWN,
    RESOURCES.METRICS.UPDATE_OWN,
    RESOURCES.POSTS.VIEW,
    RESOURCES.POSTS.CREATE,
    RESOURCES.POSTS.UPDATE_OWN,
    RESOURCES.POSTS.DELETE_OWN,
    RESOURCES.CHATS.VIEW,
    RESOURCES.CHATS.SEND,
  ],
  [UserRole.COACH]: [
    RESOURCES.METRICS.VIEW_OWN,
    RESOURCES.METRICS.CREATE_OWN,
    RESOURCES.METRICS.UPDATE_OWN,
    RESOURCES.METRICS.VIEW_ANY,
    RESOURCES.METRICS.CREATE_ANY,
    RESOURCES.METRICS.UPDATE_ANY,
    RESOURCES.METRICS.DELETE_ANY,
    RESOURCES.USERS.VIEW,
    RESOURCES.POSTS.VIEW,
    RESOURCES.POSTS.CREATE,
    RESOURCES.POSTS.UPDATE_OWN,
    RESOURCES.POSTS.DELETE_OWN,
    RESOURCES.CHATS.VIEW,
    RESOURCES.CHATS.SEND,
    RESOURCES.AI.VIEW,
    RESOURCES.COACH.ACCESS,
  ],
  [UserRole.ADMIN]: ALL_PERMISSIONS,
};

/**
 * Map permission -> mô tả tiếng Việt (dùng cho UI)
 */
export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [RESOURCES.METRICS.VIEW_OWN]: 'Xem chỉ số của bản thân',
  [RESOURCES.METRICS.CREATE_OWN]: 'Thêm chỉ số cho bản thân',
  [RESOURCES.METRICS.UPDATE_OWN]: 'Sửa chỉ số của bản thân',
  [RESOURCES.METRICS.VIEW_ANY]: 'Xem chỉ số của người khác',
  [RESOURCES.METRICS.CREATE_ANY]: 'Thêm chỉ số cho người khác',
  [RESOURCES.METRICS.UPDATE_ANY]: 'Sửa chỉ số của người khác',
  [RESOURCES.METRICS.DELETE_ANY]: 'Xóa chỉ số bất kỳ',
  [RESOURCES.USERS.VIEW]: 'Xem danh sách người dùng',
  [RESOURCES.USERS.CREATE]: 'Tạo người dùng mới',
  [RESOURCES.USERS.UPDATE]: 'Cập nhật thông tin người dùng',
  [RESOURCES.USERS.DELETE]: 'Xóa người dùng',
  [RESOURCES.AI.MANAGE]: 'Quản lý AI (keys, knowledge, rules)',
  [RESOURCES.AI.VIEW]: 'Xem thông tin AI',
  [RESOURCES.GROUPS.MANAGE]: 'Quản lý nhóm & phân quyền',
  [RESOURCES.SYSTEM.CONFIG]: 'Cấu hình hệ thống',
  [RESOURCES.SYSTEM.LOGS]: 'Xem nhật ký hệ thống',
  [RESOURCES.ADMIN.PANEL]: 'Truy cập bảng quản trị',
  [RESOURCES.POSTS.VIEW]: 'Xem bài viết',
  [RESOURCES.POSTS.CREATE]: 'Tạo bài viết mới',
  [RESOURCES.POSTS.UPDATE_OWN]: 'Sửa bài viết của mình',
  [RESOURCES.POSTS.UPDATE_ANY]: 'Sửa bài viết của người khác',
  [RESOURCES.POSTS.DELETE_OWN]: 'Xóa bài viết của mình',
  [RESOURCES.POSTS.DELETE_ANY]: 'Xóa bài viết của người khác',
  [RESOURCES.CHATS.VIEW]: 'Xem chat',
  [RESOURCES.CHATS.SEND]: 'Gửi tin nhắn chat',
  [RESOURCES.COACH.ACCESS]: 'Truy cập giao diện Coach',
};
