/**
 * Upload ảnh lên ImgBB
 */
export async function uploadToImgBB(base64Data: string | undefined): Promise<{ url: string; deleteUrl: string } | null> {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    const base64Image = base64Data.split(',')[1];
    const params = new URLSearchParams();
    params.append('image', base64Image);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: params
    });
    const result = await response.json();
    return result.success ? { url: result.data.url, deleteUrl: result.data.delete_url } : null;
  } catch (error: any) {
    console.error('[ImageUpload] Error:', error.message);
    return null;
  }
}