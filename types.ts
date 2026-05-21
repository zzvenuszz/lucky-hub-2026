export enum UserRole {
  MEMBER = 'MEMBER',
  COACH = 'COACH',
  ADMIN = 'ADMIN'
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED'
}

export enum Permission {
  MANAGE_USERS = 'MANAGE_USERS',
  DELETE_USERS = 'DELETE_USERS',
  MANAGE_METRICS = 'MANAGE_METRICS',
  MANAGE_AI = 'MANAGE_AI'
}

export enum HealthGoal {
  LOSE_WEIGHT = 'Giảm cân',
  GAIN_WEIGHT = 'Tăng cân',
  BODY_RECOMP = 'Thay đổi cấu trúc cơ thể',
  STRENGTHEN_HEALTH = 'Tăng cường sức khỏe',
  IMMUNITY = 'Tăng cường đề kháng',
  BONE_JOINT = 'Chăm sóc xương khớp',
  CARDIO = 'Tim mạch',
  DIABETES = 'Tiểu đường',
  SKINCARE = 'Làn da',
  OTHER = 'Khác'
}

export enum AuditLogType {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  POST_CREATE = 'POST_CREATE',
  POST_UPDATE = 'POST_UPDATE',
  METRIC_UPDATE = 'METRIC_UPDATE',
  METRIC_HELP_UPDATE = 'METRIC_HELP_UPDATE',
  AI_KEY_UPDATE = 'AI_KEY_UPDATE'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  SYSTEM = 'system'
}

export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export enum WsEvent {
  // Chat events
  CHAT_MESSAGE = 'chat:message',
  CHAT_TYPING = 'chat:typing',
  CHAT_STOP_TYPING = 'chat:stopTyping',
  CHAT_REACTION = 'chat:reaction',
  CHAT_READ = 'chat:read',
  CHAT_EDIT = 'chat:edit',
  CHAT_DELETE = 'chat:delete',
  CHAT_CLEAR = 'chat:clear',
  // Status events
  USER_ONLINE = 'user:online',
  USER_OFFLINE = 'user:offline',
  // Notification events
  NOTIFICATION_NEW = 'notification:new',
  // Post events
  POST_REACTED = 'post:reacted',
  // Metric events
  METRIC_UPDATED = 'metric:updated',
  // Session events
  SESSION_INVALIDATED = 'session:invalidated',
  // Comment events
  COMMENT_NEW = 'comment:new',
  COMMENT_REPLY = 'comment:reply',
  COMMENT_REACTION = 'comment:reaction',
  // Tag events
  TAG_NEW = 'tag:new',
  // Goal events
  GOAL_COMPLETED = 'goal:completed',
  GOAL_REMINDER = 'goal:reminder',
  // Chat Group events
  CHAT_GROUP_MESSAGE = 'chatGroup:message',
}

export interface GeminiKey {
  id?: string;
  _id?: string;
  key: string;
  label: string;
  isActive: boolean;
  failCount: number;
  cooldownUntil: string | null;
  lastUsed?: string;
}

export interface AuditLog {
  id?: string;
  _id?: string;
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
  type: AuditLogType;
  details: string;
  timestamp: string;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export interface PostImage {
  url: string;
  deleteUrl: string;
}

export interface PostReaction {
  userId: string;
  userName?: string;
  userAvatar?: string;
  type: string; 
  count: number; 
}

export interface TaggedUser {
  userId: string;
  userName: string;
}

export interface CommentReaction {
  userId: string;
  type: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userFullName: string;
  userAvatar?: string;
  content: string;
  timestamp: string;
  editedAt?: string;
  parentId?: string | null;
  taggedUsers?: TaggedUser[];
  reactions?: CommentReaction[];
}

export interface Post {
  id: string;
  _id?: string;
  userId: string;
  userFullName: string;
  userAvatar?: string;
  userBadges: string[];
  content: string;
  imageUrls: string[]; 
  images?: PostImage[]; 
  timestamp: string;
  reactions?: PostReaction[];
  hashtags?: string[];
  comments?: Comment[];
  commentCount?: number;
}

export interface HealthMetric {
  id: string;
  _id?: string;
  userId: string;
  userFullName?: string; 
  date: string;
  weight: number; 
  bodyFat: number; 
  boneMinerals: number; 
  waterPercent: number; 
  muscleMass: number; 
  balanceIndex: number; 
  energy: number; 
  bioAge: number;
  visceralFat: number;
}

export interface User {
  id: string;
  _id?: string;
  username: string;
  email: string;
  password?: string;
  fullName: string;
  birthDate: string;
  height: number;
  weight: number;
  phoneNumber: string;
  gender: 'Nam' | 'Nữ';
  healthGoals: HealthGoal[];
  role: UserRole;
  status: AccountStatus;
  permissions: Permission[];
  avatar?: string;
  isPasswordEncrypted?: boolean; 
  badges: string[];
  isNddManager?: boolean;
  nutritionGroupId?: string;
  nutritionGroupName?: string;
  pendingNutritionGroupId?: string;
  userGroups?: { id: string; name: string }[];
}

export interface MessageReaction {
  userId: string;
  userName: string;
  emoji: string;
  timestamp: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole | 'AI';
  content: string;
  timestamp: string;
  type: MessageType;
  status: MessageStatus;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  voiceUrl?: string;
  replyTo?: {
    messageId: string;
    senderName: string;
    content: string;
  };
  reactions?: MessageReaction[];
  editedAt?: string;
  meta?: {
    chosenBy: string;
    chosenByName: string;
    choice: 'tham khảo' | 'bỏ qua';
    chosenAt: string;
  };
}

export interface ChatSession {
  id: string;
  memberId: string;
  coachId: string;
  messages: Message[];
  lastReadBy?: Record<string, string>; // userId -> lastReadMessageId
}

export interface ChatGroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  type: MessageType;
}

export interface ChatGroup {
  id: string;
  name: string;
  nutritionGroupIds: string[];
  memberIds: string[];
  createdBy: string;
  isActive: boolean;
  messages: ChatGroupMessage[];
  lastMessage?: { content: string; senderName: string; timestamp: string };
}

export interface AIKnowledge {
  id: string;
  keyword: string;
  content: string;
}

export interface AIRule {
  id: string;
  content: string;
}

// WebSocket message envelope
export interface WsMessage {
  event: WsEvent;
  payload: any;
  timestamp: string;
  fromUserId: string;
}

export interface NutritionGroup {
  id: string;
  _id?: string;
  name: string;
  ownerId: string;
  ownerName: string;
  address: string;
  members: string[];
  isActive: boolean;
  pendingMembers: {
    userId: string;
    userName?: string;
    fromNutritionGroupId: string;
    requestedAt: string;
  }[];
}

export type NotificationType = 'reaction' | 'comment' | 'reply' | 'tag' | 'message' | 'metric_help' | 'badge' | 'system' | 'goal_completed' | 'goal_reminder';