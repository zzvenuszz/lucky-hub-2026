
export enum UserRole {
  MEMBER = 'MEMBER',
  COACH = 'COACH',
  ADMIN = 'ADMIN'
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED'
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

export interface HealthMetric {
  id: string;
  userId: string;
  date: string;
  weight: number; // kg
  bodyFat: number; // %
  boneMinerals: number; // kg
  waterPercent: number; // %
  muscleMass: number; // kg
  balanceIndex?: number;
  energy: number; // kcal
  bioAge: number;
  visceralFat: number;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  birthDate: string;
  height: number;
  weight: number; // kg - Cân nặng ban đầu
  phoneNumber: string;
  gender: 'Nam' | 'Nữ';
  healthGoal: HealthGoal;
  role: UserRole;
  status: AccountStatus;
  avatar?: string;
  isPasswordEncrypted?: boolean; // Mới thêm: Trạng thái mã hóa mật khẩu
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
