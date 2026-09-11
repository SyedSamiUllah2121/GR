/**
 * Turning a picked image file into something small enough to keep.
 *
 * Everything in this app lives in localStorage, which is a few megabytes for
 * the whole of it — inspections, accounts, checklist and jobs together. A
 * photograph straight off a phone is several megabytes on its own once it is
 * a data URI, so two receipts would fill the store and the next write to
 * *anything*, including an inspection being filled in on another screen,
 * would start failing. That is the reason this module exists: not to make
 * photos tidy, but to stop one from taking the store down.
 *
 * Scaling to a long edge and re-encoding as JPEG brings a typical phone photo
 * from megabytes to a couple of hundred kilobytes, which is still far more
 * detail than is needed to read a receipt or see that a pipe was replaced.
 */

/** The longest edge kept, in pixels. A receipt is legible well below this. */
export const MAX_EDGE = 1600;

/** JPEG quality to try first. Below about 0.45 small print starts to go. */
export const JPEG_QUALITY = 0.72;

/**
 * What one photograph is allowed to weigh once stored.
 *
 * A budget rather than a hope. Scaling and re-encoding brings a typical phone
 * photo well under this on the first try, but "typical" is not a guarantee:
 * a dense, noisy image re-encodes far larger, and six of those would fill the
 * store as surely as the originals would have. So the settings below are
 * stepped down until the result actually fits.
 */
export const TARGET_BYTES = 350 * 1024;

/**
 * Settings to try, in order, until one comes in under the budget.
 *
 * Quality is given up before size, because a slightly soft photograph of a
 * receipt still reads and a small one does not.
 */
const ATTEMPTS: { edge: number; quality: number }[] = [
  { edge: MAX_EDGE, quality: JPEG_QUALITY },
  { edge: MAX_EDGE, quality: 0.6 },
  { edge: 1280, quality: 0.55 },
  { edge: 1024, quality: 0.5 },
  { edge: 900, quality: 0.45 },
];

export interface ReadImageResult {
  /** The shrunk image, ready to store. */
  dataUrl?: string;
  /** Why it could not be used, in words worth putting beside the field. */
  error?: string;
}

/** Reads the file off disk as a data URI, unchanged. */
function asDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsDataURL(file);
  });
}

/**
 * Draws the image at a size that fits `MAX_EDGE` and hands back a JPEG.
 *
 * The white fill matters: JPEG has no transparency, and a screenshot or a PNG
 * with an alpha channel would otherwise come out on a black ground, which
 * reads as a corrupted photo rather than a converted one.
 */
function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('undecodable'));
    img.src = dataUrl;
  });
}

function encode(img: HTMLImageElement, edge: number, quality: number): string {
  const scale = Math.min(1, edge / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * The smallest of the attempts that comes in under the budget, or the
 * smallest reached if none of them do — a very dense image still ends up far
 * below what it arrived as, and `completeJob` refuses the write if even that
 * will not fit, so nothing is ever silently lost.
 */
async function shrink(dataUrl: string): Promise<string> {
  const img = await decode(dataUrl);

  let smallest = '';
  for (const { edge, quality } of ATTEMPTS) {
    const candidate = encode(img, edge, quality);
    if (!smallest || candidate.length < smallest.length) smallest = candidate;
    if (approximateBytes(candidate) <= TARGET_BYTES) return candidate;
  }
  return smallest;
}

/**
 * A picked file, ready to attach — or the reason it cannot be.
 *
 * Returns the reason rather than throwing, so the caller can put it beside
 * the upload button instead of the photo silently not appearing.
 */
export async function readImageFile(file: File): Promise<ReadImageResult> {
  if (!file.type.startsWith('image/')) {
    return { error: `${file.name} is not an image` };
  }

  let original: string;
  try {
    original = await asDataUrl(file);
  } catch {
    return { error: `${file.name} could not be read` };
  }

  try {
    return { dataUrl: await shrink(original) };
  } catch {
    /*
     * A format the browser will not decode. HEIC off an iPhone is the one
     * that actually turns up — it is picked by an "image/*" input quite
     * happily and then refuses to draw. Saying so beats storing something
     * that nothing downstream can display.
     */
    return {
      error: `${file.name} is in a format this browser cannot open — try a JPEG or PNG`,
    };
  }
}

/** Roughly how many bytes a data URI will take in storage. */
export function approximateBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // 4 base64 characters carry 3 bytes; padding is a rounding error at this size
  return Math.round((base64.length * 3) / 4);
}

/** The same figure in something a person can read. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
