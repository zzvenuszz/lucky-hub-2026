import { createHash, randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SystemSettings } from '../../models/SystemSettings.ts';
import { decrypt } from '../../utils/encryption.ts';

interface StorageConfig {
  apiKey?: string;
  apiSecret?: string;
  cloudName?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
}

export interface StorageProvider {
  provider: 'imgbb' | 'cloudinary' | 's3';
  config?: StorageConfig;
  isActive: boolean;
  priority: number;
}

const readSecret = (value: string | undefined, label: string): string => {
  if (!value) throw new Error(`Thiếu thông tin ${label} của storage provider.`);
  return value.split(':').length === 3 ? decrypt(value) : value;
};

const parseImageData = (dataUrl: string): { buffer: Buffer; contentType: string } => {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Ảnh không hợp lệ. Chỉ chấp nhận PNG, JPEG hoặc WebP.');

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw new Error('Ảnh sau khi cắt phải có dung lượng tối đa 5 MB.');
  }

  return { buffer, contentType: match[1] };
};

async function uploadToImgBB(dataUrl: string, config: StorageConfig): Promise<string> {
  const apiKey = readSecret(config.apiKey, 'API key ImgBB');
  const body = new URLSearchParams({ image: dataUrl.split(',')[1] });
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json() as { success?: boolean; data?: { url?: string }; error?: { message?: string } };
  if (!response.ok || !result.success || !result.data?.url) {
    throw new Error(result.error?.message || 'ImgBB không thể lưu logo.');
  }
  return result.data.url;
}

async function uploadToCloudinary(dataUrl: string, config: StorageConfig, uploadFolder: string): Promise<string> {
  if (!config.cloudName) throw new Error('Thiếu Cloud Name của Cloudinary.');
  const apiKey = readSecret(config.apiKey, 'API key Cloudinary');
  const apiSecret = readSecret(config.apiSecret, 'API secret Cloudinary');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `luckyhub/${uploadFolder}`;
  const signature = createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');
  const body = new URLSearchParams({
    file: dataUrl,
    api_key: apiKey,
    timestamp: String(timestamp),
    folder,
    signature,
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json() as { secure_url?: string; error?: { message?: string } };
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || 'Cloudinary không thể lưu logo.');
  }
  return result.secure_url;
}

async function uploadToS3(
  buffer: Buffer,
  contentType: string,
  config: StorageConfig,
  uploadFolder: string,
): Promise<string> {
  if (!config.bucket || !config.region) throw new Error('Thiếu Bucket hoặc Region của S3.');
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: readSecret(config.accessKey, 'Access Key S3'),
      secretAccessKey: readSecret(config.secretKey, 'Secret Key S3'),
    },
  });
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
  const key = `${uploadFolder}/${randomUUID()}.${extension}`;
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }), { abortSignal: AbortSignal.timeout(15000) });
  } finally {
    client.destroy();
  }

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const host = config.bucket.includes('.')
    ? `s3.${config.region}.amazonaws.com/${config.bucket}`
    : `${config.bucket}.s3.${config.region}.amazonaws.com`;
  return `https://${host}/${encodedKey}`;
}

export async function uploadImageToStorageProvider(dataUrl: string, provider: StorageProvider, uploadFolder = 'branding'): Promise<string> {
  const { buffer, contentType } = parseImageData(dataUrl);
  const config = provider.config || {};
  switch (provider.provider) {
    case 'imgbb':
      return uploadToImgBB(dataUrl, config);
    case 'cloudinary':
      return uploadToCloudinary(dataUrl, config, uploadFolder);
    case 's3':
      return uploadToS3(buffer, contentType, config, uploadFolder);
    default:
      throw new Error('Storage provider hiện tại không được hỗ trợ.');
  }
}

export async function uploadBrandLogo(dataUrl: string): Promise<string> {
  const settings = await SystemSettings.findOne({}).select('storage.providers').lean();
  const provider = (settings?.storage?.providers as StorageProvider[] | undefined)
    ?.filter(item => item.isActive)
    .sort((a, b) => a.priority - b.priority)[0];

  if (!provider) throw new Error('Hãy bật và cấu hình một storage provider trước khi tải logo lên.');
  return uploadImageToStorageProvider(dataUrl, provider);
}
