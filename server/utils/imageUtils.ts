/**
 * Upload ảnh lên ImgBB
 */
import { SystemSettings } from '../models/SystemSettings.ts';
import { decrypt } from './encryption.ts';
import { StorageProvider, uploadImageToStorageProvider } from '../services/storage/imageStorageService.ts';

export async function uploadToImgBB(
  base64Data: string | undefined,
  options: { required?: boolean } = {},
): Promise<{ url: string; deleteUrl: string } | null> {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  try {
    let apiKey = process.env.IMGBB_API_KEY || '';
    const settings = await SystemSettings.findOne({}).select('storage.providers').lean();
    const provider = (settings?.storage?.providers || [])
      .filter((item: any) => item.isActive)
      .sort((left: any, right: any) => left.priority - right.priority)[0];
    if (provider && provider.provider !== 'imgbb') {
      const url = await uploadImageToStorageProvider(base64Data, provider as StorageProvider, 'uploads');
      return { url, deleteUrl: '' };
    }
    if (provider?.config?.apiKey) {
      const storedKey = String(provider.config.apiKey);
      apiKey = storedKey.split(':').length === 3 ? decrypt(storedKey) : storedKey;
    }
    if (!apiKey) {
      if (options.required) throw new Error('Chưa cấu hình storage provider. Hãy cấu hình ImgBB, Cloudinary hoặc S3 trong trang quản trị rồi thử lại.');
      console.warn('[ImageUpload] ImgBB is not configured; skipping image upload.');
      return null;
    }
    const base64Image = base64Data.split(',')[1];
    const params = new URLSearchParams();
    params.append('image', base64Image);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (result.success && result.data?.url) {
      return { url: result.data.url, deleteUrl: result.data.delete_url || '' };
    }
    throw new Error(result.error?.message || 'Nhà cung cấp lưu trữ không chấp nhận ảnh tải lên.');
  } catch (error: any) {
    console.error('[ImageUpload] Error:', error.message);
    if (options.required) {
      throw new Error(`Tải ảnh lên thất bại: ${error.message || 'Lỗi không xác định từ nhà cung cấp lưu trữ.'}`);
    }
    return null;
  }
}