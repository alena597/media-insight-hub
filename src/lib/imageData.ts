/**
 * Стиснення зображення з HTMLImageElement у JPEG data URL.
 *
 * @param img - Елемент зображення.
 * @param maxWidth - Максимальна ширина.
 * @param quality - Якість JPEG 0…1.
 * @returns Data URL.
 */
export function dataUrlFromImageElement(
  img: HTMLImageElement,
  maxWidth = 960,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        reject(new Error('no size'));
        return;
      }
      const scale = Math.min(1, maxWidth / w);
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no ctx'));
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL('image/jpeg', quality));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Мініатюра для прев’ю в історії / обраному.
 *
 * @param dataUrl - Вхідний data URL.
 * @param maxSize - Максимальний розмір більшої сторони.
 * @returns Стиснутий JPEG data URL.
 */
export function thumbnailFromDataUrl(dataUrl: string, maxSize = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(1, maxSize / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error('image load'));
    img.src = dataUrl;
  });
}

/**
 * Читає blob: URL у data URL.
 *
 * @param url - Blob URL.
 * @returns Data URL.
 */
export async function blobUrlToDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  const b = await r.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('read'));
    fr.readAsDataURL(b);
  });
}

/**
 * Мініатюра з довільного URL зображення.
 *
 * @param url - URL (у т. ч. blob:).
 * @param maxSize - Максимальний розмір сторони.
 * @returns JPEG data URL або null.
 */
export async function thumbnailFromImageUrl(url: string, maxSize = 200): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const full = await dataUrlFromImageElement(img, 640, 0.8);
        const t = await thumbnailFromDataUrl(full, maxSize);
        resolve(t);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
