// أدوات مرفق الوصفة (صورة أو PDF): التحقق، الضغط في المتصفح، ومسار التخزين.
// لا تُعاد استعمال compressCatalogImage في ImageUploadField: خاصة بذلك الملف وثوابت الكتالوج (800px / 0.82).

export const RX_BUCKET = 'prescriptions';
export const RX_MAX_BYTES = 2 * 1024 * 1024; // حد الـ bucket وقيد الجدول
export const RX_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

const RX_MAX_DIMENSION = 1400;
const RX_QUALITIES = [0.75, 0.6, 0.45, 0.35];
// حارس ضد الملفات الشاذة قبل فك ترميزها؛ الضغط يتكفّل بصور الهواتف الكبيرة
const RX_MAX_INPUT_BYTES = 25 * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface PreparedFile { blob: Blob; name: string; mime: string; size: number }

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّرت قراءة الصورة — جرّب صورة أخرى.')); };
    el.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
}

/** يتحقق من الملف ويجهّزه للرفع؛ يرمي Error برسالة عربية جاهزة للعرض */
export async function prepareRxFile(file: File): Promise<PreparedFile> {
  if (!EXT[file.type]) {
    throw new Error('نوع الملف غير مدعوم — المسموح: صور JPG وPNG وWEBP وملفات PDF.');
  }
  if (file.type === 'application/pdf') {
    if (file.size > RX_MAX_BYTES) {
      throw new Error('حجم ملف PDF يتجاوز 2 ميغابايت — صغّره أو أرفق صورة بدلاً منه.');
    }
    return { blob: file, name: file.name.slice(0, 255), mime: file.type, size: file.size };
  }
  if (file.size > RX_MAX_INPUT_BYTES) throw new Error('حجم الصورة كبير جداً — جرّب صورة أخرى.');

  const img = await loadImage(file);
  const longest = Math.max(img.width, img.height);
  const scale = longest > RX_MAX_DIMENSION ? RX_MAX_DIMENSION / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر تجهيز الصورة في هذا المتصفح.');
  // خلفية بيضاء أولاً: JPEG بلا قناة شفافية، وبدونها تصير شفافية PNG/WebP سوداء
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const base = file.name.replace(/\.[^.]+$/, '').trim() || 'وصفة';
  for (const q of RX_QUALITIES) {
    const blob = await encode(canvas, 'image/jpeg', q);
    if (blob && blob.size <= RX_MAX_BYTES) {
      return { blob, name: `${base}.jpg`.slice(0, 255), mime: 'image/jpeg', size: blob.size };
    }
  }
  throw new Error('تعذّر ضغط الصورة إلى أقل من 2 ميغابايت — جرّب صورة أخرى.');
}

/**
 * مسار جديد لكل رفع: {pharmacy_id}/{rx_id}.{stamp}.{ext}. قيد الجدول لا يشترط إلا البادئة {pharmacy_id}/{rx_id}.،
 * والاسم الفريد ضروري لأن لا upsert ولا سياسة update على التخزين، فاستبدال المرفق = رفع باسم جديد ثم حذف القديم
 */
export function rxStoragePath(pharmacyId: string, rxId: string, mime: string): string {
  return `${pharmacyId}/${rxId}.${Date.now().toString(36)}.${EXT[mime]}`;
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
