import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { Group } from '../models/Group.ts';
import { SystemSettings } from '../models/SystemSettings.ts';
import { User } from '../models/User.ts';
import { ALL_PERMISSIONS } from '../config/permissions.ts';
import { encrypt, isStrongEncryptionPassphrase, isValidConfiguredEncryptionKey } from '../utils/encryption.ts';
import { isValidEmail, isValidUsername } from '../../services/validationService.ts';

export interface SetupInput {
  databaseUri: string;
  admin?: {
    username: string;
    email: string;
    fullName: string;
    password: string;
  };
  encryptionKey: string;
  storage?: {
    provider: 'imgbb' | 'cloudinary' | 's3';
    config: Record<string, string>;
  };
  email?: {
    providers: Array<{ provider: 'brevo' | 'sendgrid'; apiKey: string }>;
    senderEmail: string;
    senderName: string;
    appBaseUrl: string;
  };
}

interface PersistedSetup {
  version: 1;
  setupComplete: boolean;
  databaseUri: string;
  encryptionKey: string;
  pending?: {
    admin?: {
      username: string;
      email: string;
      fullName: string;
      passwordHash: string;
    };
    storageProviders?: Array<Record<string, unknown>>;
    email?: Record<string, unknown>;
  };
}

let generatedAccessToken = '';
let setupCompletionInProgress = false;
let setupCompletionKnown = false;
let setupStateInitialized = false;

function getSetupFilePath(): string {
  const dataDirectory = process.env.LUCKY_HUB_DATA_DIR?.trim()
    ? path.resolve(process.env.LUCKY_HUB_DATA_DIR)
    : path.resolve(process.cwd(), '.data');
  return path.join(dataDirectory, 'setup.json');
}

export async function readPersistedSetup(): Promise<PersistedSetup | null> {
  try {
    const raw = await fs.readFile(getSetupFilePath(), 'utf8');
    const value = JSON.parse(raw) as PersistedSetup;
    if (value.version !== 1 || typeof value.databaseUri !== 'string' || typeof value.encryptionKey !== 'string') {
      throw new Error('Invalid first-run setup configuration.');
    }
    return value;
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writePersistedSetup(value: PersistedSetup): Promise<void> {
  const filePath = getSetupFilePath();
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);

  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.chmod(temporaryPath, 0o600);
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600);
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch (cleanupError: any) {
      if (cleanupError.code !== 'ENOENT') console.error('[FirstRunSetup] Could not remove a temporary setup file:', cleanupError.message);
    }
    throw error;
  }
}

export async function isFirstRunSetupRequired(): Promise<boolean> {
  const persisted = await readPersistedSetup();
  if (persisted) return !persisted.setupComplete;
  if (setupCompletionKnown) return false;
  if (setupStateInitialized) return true;
  if (mongoose.connection.readyState === 1) {
    const settings = await SystemSettings.findOne({}).select('firstRunSetupComplete').lean();
    if (settings?.firstRunSetupComplete) {
      setupCompletionKnown = true;
      setupStateInitialized = true;
      return false;
    }
  }
  setupStateInitialized = true;
  return true;
}

export async function getFirstRunSetupStatus(): Promise<{ databaseConnected: boolean; adminRequired: boolean; encryptionKeyConfigured: boolean }> {
  const databaseConnected = mongoose.connection.readyState === 1;
  const adminRequired = !databaseConnected || await User.countDocuments() === 0;
  const configuredEncryptionKey = process.env.AI_ENCRYPTION_KEY || '';
  return {
    databaseConnected,
    adminRequired,
    encryptionKeyConfigured: !!configuredEncryptionKey && isValidConfiguredEncryptionKey(configuredEncryptionKey),
  };
}

export async function initializeFirstRunConfiguration(): Promise<PersistedSetup | null> {
  const persisted = await readPersistedSetup();
  if (!persisted) return null;
  if (!process.env.MONGODB_URI?.trim()) process.env.MONGODB_URI = persisted.databaseUri;
  if (!process.env.AI_ENCRYPTION_KEY) process.env.AI_ENCRYPTION_KEY = persisted.encryptionKey;
  return persisted;
}

export function initializeSetupAccessToken(): string {
  if (process.env.LUCKY_HUB_SETUP_TOKEN?.trim()) return process.env.LUCKY_HUB_SETUP_TOKEN.trim();
  if (!generatedAccessToken) generatedAccessToken = crypto.randomBytes(32).toString('base64url');
  return generatedAccessToken;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function validateDatabaseUri(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10 || value.length > 2048) {
    throw new Error('Nhập URI MongoDB hợp lệ.');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('URI MongoDB không đúng định dạng.');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('Chỉ hỗ trợ URI mongodb:// hoặc mongodb+srv://.');
  }
  return value;
}

function validateEncryptionKey(value: unknown): string {
  if (typeof value !== 'string' || (!isStrongEncryptionPassphrase(value) && !isValidConfiguredEncryptionKey(value))) {
    throw new Error('Khóa mã hóa phải có chữ hoa, chữ thường, số và ký tự đặc biệt.');
  }
  return value;
}

function validateSetupInput(input: SetupInput, configuredDatabaseUri: string, configuredEncryptionKey: string): SetupInput {
  if (!input || typeof input !== 'object') throw new Error('Dữ liệu setup không hợp lệ.');

  input.databaseUri = validateDatabaseUri(configuredDatabaseUri || input.databaseUri);
  input.encryptionKey = validateEncryptionKey(input.encryptionKey || configuredEncryptionKey);

  if (input.admin) {
    const username = typeof input.admin.username === 'string' ? input.admin.username.trim().toLowerCase() : '';
    const email = typeof input.admin.email === 'string' ? input.admin.email.trim().toLowerCase() : '';
    const fullName = typeof input.admin.fullName === 'string' ? input.admin.fullName.trim() : '';
    if (!isValidUsername(username).valid) throw new Error('Tên đăng nhập phải từ 3 đến 30 ký tự, chỉ gồm chữ, số và dấu gạch dưới.');
    if (!isValidEmail(email)) throw new Error('Email quản trị không hợp lệ.');
    if (fullName.length < 2 || fullName.length > 100) throw new Error('Tên hiển thị phải từ 2 đến 100 ký tự.');
    if (typeof input.admin.password !== 'string' || input.admin.password.length < 12 || input.admin.password.length > 100) {
      throw new Error('Mật khẩu quản trị phải dài từ 12 đến 100 ký tự.');
    }
    input.admin = { username, email, fullName, password: input.admin.password };
  }

  return input;
}

function prepareStorageProviders(storage?: SetupInput['storage']): Array<Record<string, unknown>> {
  if (!storage) return [];
  const config = storage.config || {};
  const requiredByProvider: Record<string, string[]> = {
    imgbb: ['apiKey'],
    cloudinary: ['cloudName', 'apiKey', 'apiSecret'],
    s3: ['accessKey', 'secretKey', 'bucket', 'region'],
  };
  const required = requiredByProvider[storage.provider];
  if (!required) throw new Error('Storage provider không được hỗ trợ.');
  for (const field of required) {
    if (typeof config[field] !== 'string' || !config[field].trim()) {
      throw new Error(`Thiếu trường ${field} cho ${storage.provider}.`);
    }
  }
  const encryptedConfig = { ...config };
  for (const field of ['apiKey', 'apiSecret', 'accessKey', 'secretKey']) {
    const value = encryptedConfig[field];
    if (typeof value === 'string' && value) encryptedConfig[field] = encrypt(value);
  }
  return [{
    provider: storage.provider,
    config: encryptedConfig,
    isActive: true,
    priority: 1,
    label: storage.provider === 'imgbb' ? 'ImgBB' : storage.provider === 'cloudinary' ? 'Cloudinary' : 'Amazon S3',
  }];
}

function prepareEmailSettings(email: NonNullable<SetupInput['email']>): { providers: Array<Record<string, unknown>>; settings: Record<string, unknown> } {
  const value = email;
  const senderEmail = typeof value.senderEmail === 'string' ? value.senderEmail.trim() : '';
  const senderName = typeof value.senderName === 'string' ? value.senderName.trim() : '';
  const appBaseUrl = typeof value.appBaseUrl === 'string' ? value.appBaseUrl.trim() : '';
  const environmentSenderName = (process.env.EMAIL_FROM_NAME || 'Lucky Hub').replace(/^"|"$/g, '');
  if (senderEmail && !isValidEmail(senderEmail)) throw new Error('Email người gửi không hợp lệ.');
  if (senderName.length > 100) throw new Error('Tên người gửi không được quá 100 ký tự.');
  if (appBaseUrl) {
    try {
      const parsed = new URL(appBaseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      throw new Error('URL ứng dụng phải bắt đầu bằng http:// hoặc https://.');
    }
  }

  const providers = (value.providers || [])
    .filter(item => typeof item?.apiKey === 'string' && item.apiKey.trim())
    .map((item, index) => {
      if (!['brevo', 'sendgrid'].includes(item.provider)) throw new Error('Nhà cung cấp email không được hỗ trợ.');
      return {
        provider: item.provider,
        apiKey: encrypt(item.apiKey.trim()),
        isActive: true,
        priority: index + 1,
        label: item.provider === 'brevo' ? 'Brevo' : 'SendGrid',
      };
    });

  return {
    providers,
    settings: {
      providers,
      senderEmail: senderEmail || process.env.EMAIL_FROM || 'luckyhubvn@gmail.com',
      senderName: senderName || environmentSenderName,
      appBaseUrl: (appBaseUrl || process.env.FRONTEND_URL || 'https://lucky-hub-2026.onrender.com').replace(/\/$/, ''),
    },
  };
}

async function applyPendingSetup(persisted: PersistedSetup): Promise<boolean> {
  if (!persisted.pending) throw new Error('Không có cấu hình setup đang chờ.');
  if (mongoose.connection.readyState === 1 && process.env.MONGODB_URI !== persisted.databaseUri) {
    await mongoose.disconnect();
  }
  process.env.MONGODB_URI = persisted.databaseUri;
  process.env.AI_ENCRYPTION_KEY = persisted.encryptionKey;

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(persisted.databaseUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    });
  }

  await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));

  const pendingAdmin = persisted.pending.admin;
  const existingUsers = await User.countDocuments();
  const adminCreated = existingUsers === 0;
  if (existingUsers === 0) {
    if (!pendingAdmin) throw new Error('Cơ sở dữ liệu chưa có user; cần cung cấp thông tin tài khoản quản trị.');
    const adminGroup = await Group.findOneAndUpdate(
      { name: 'Quản trị viên' },
      { $set: { description: 'Quản trị viên hệ thống', permissions: ALL_PERMISSIONS, isActive: true, isDefault: false } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const defaultGroup = await Group.findOneAndUpdate(
      { name: 'Người dùng' },
      { $set: { description: 'Người dùng mặc định', permissions: [], isActive: true, isDefault: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const admin = await User.create({
      username: pendingAdmin.username,
      email: pendingAdmin.email,
      fullName: pendingAdmin.fullName,
      password: pendingAdmin.passwordHash,
      groupId: adminGroup._id,
      isPasswordEncrypted: true,
      isEmailVerified: true,
      status: 'ACTIVE',
    });
    adminGroup.members.push(admin._id);
    await adminGroup.save();
    await defaultGroup.save();
  } else {
    console.log('[FirstRunSetup] Existing users found; skipping initial admin creation.');
  }

  const settingsToUpdate: Record<string, unknown> = {
    firstRunSetupComplete: true,
    ai: { encryptionKey: encrypt(persisted.encryptionKey), geminiProxyUrl: '', updatedBy: pendingAdmin?.fullName || 'system' },
    updatedBy: pendingAdmin?.fullName || 'system',
  };
  if (persisted.pending.email) settingsToUpdate.email = persisted.pending.email;
  if (persisted.pending.storageProviders) {
    settingsToUpdate.storage = {
      providers: persisted.pending.storageProviders,
      updatedBy: pendingAdmin?.fullName || 'system',
    };
  }

  await SystemSettings.findOneAndUpdate(
    {},
    { $set: settingsToUpdate },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await writePersistedSetup({
    version: 1,
    setupComplete: true,
    databaseUri: persisted.databaseUri,
    encryptionKey: persisted.encryptionKey,
  });
  setupStateInitialized = true;
  setupCompletionKnown = true;
  return adminCreated;
}

export async function resumePendingSetup(persisted: PersistedSetup): Promise<void> {
  if (persisted.setupComplete || !persisted.pending) return;
  await applyPendingSetup(persisted);
}

export async function testMongoConnection(databaseUri: unknown): Promise<void> {
  const uri = validateDatabaseUri(databaseUri);
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  try {
    await connection.asPromise();
  } finally {
    await connection.close();
  }
}

export async function testConfiguredMongoConnection(): Promise<void> {
  const databaseUri = process.env.MONGODB_URI?.trim();
  if (!databaseUri) throw new Error('MONGODB_URI chưa được cấu hình.');
  await testMongoConnection(databaseUri);
}

export async function getAdminRequirementForDatabase(databaseUri: unknown): Promise<boolean> {
  const uri = validateDatabaseUri(databaseUri);
  if (mongoose.connection.readyState === 1 && process.env.MONGODB_URI?.trim() === uri) {
    return await User.countDocuments() === 0;
  }
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  try {
    await connection.asPromise();
    if (!connection.db) throw new Error('Không thể truy vấn database MongoDB.');
    return await connection.db.collection('users').countDocuments() === 0;
  } finally {
    await connection.close();
  }
}

export async function completeFirstRunSetup(rawInput: SetupInput): Promise<boolean> {
  if (setupCompletionInProgress) throw new Error('Một tiến trình setup khác đang được thực hiện.');
  setupCompletionInProgress = true;
  try {
    if (!(await isFirstRunSetupRequired())) throw new Error('Ứng dụng đã được setup.');
    const configuredDatabaseUri = mongoose.connection.readyState === 1 ? process.env.MONGODB_URI?.trim() || '' : '';
    const configuredEncryptionKey = process.env.AI_ENCRYPTION_KEY || '';
    const input = validateSetupInput(rawInput, configuredDatabaseUri, configuredEncryptionKey);
    if (mongoose.connection.readyState !== 1 || input.databaseUri !== configuredDatabaseUri) {
      await testMongoConnection(input.databaseUri);
    }

    process.env.AI_ENCRYPTION_KEY = input.encryptionKey;
    const storageProviders = prepareStorageProviders(input.storage);
    const preparedEmail = input.email ? prepareEmailSettings(input.email) : undefined;
    const persisted: PersistedSetup = {
      version: 1,
      setupComplete: false,
      databaseUri: input.databaseUri,
      encryptionKey: input.encryptionKey,
      pending: {
        ...(input.admin ? {
        admin: {
          username: input.admin.username,
          email: input.admin.email,
          fullName: input.admin.fullName,
          passwordHash: hashPassword(input.admin.password),
        },
        } : {}),
        ...(input.storage ? { storageProviders } : {}),
        ...(preparedEmail ? { email: { ...preparedEmail.settings, providers: preparedEmail.providers } } : {}),
      },
    };

    await writePersistedSetup(persisted);
    const adminCreated = await applyPendingSetup(persisted);
    setupStateInitialized = true;
    setupCompletionKnown = true;
    return adminCreated;
  } finally {
    setupCompletionInProgress = false;
  }
}
