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
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole | 'AI';
  content: string;
  timestamp: string;
  imageUrl?: string;
}

export interface ChatSession {
  id: string;
  memberId: string;
  coachId: string;
  messages: Message[];
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