import { detectQuality, type Quality } from '../render/quality';

const QUALITY_KEY = 'qoti.quality.v1';

function isQuality(q: string | null): q is Quality {
  return q === 'low' || q === 'medium' || q === 'high';
}

/** The preset to start with: `?quality=` first, then the saved setting, then a guess from the device. */
export function initialQuality(): Quality {
  const fromUrl = new URLSearchParams(location.search).get('quality');
  if (isQuality(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (isQuality(saved)) return saved;
  } catch {
    // Storage can be blocked; the device guess is fine.
  }
  return detectQuality();
}
