/**
 * Image compression utility
 * Centralized image compression logic used across multiple components
 */

export const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1024;
      let width = img.width;
      let height = img.height;
      
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return resolve(base64Str);
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    
    img.onerror = () => {
      console.warn('[ImageUtils] Failed to compress image, returning original');
      resolve(base64Str);
    };
  });
};
