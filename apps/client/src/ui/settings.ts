// Per-player settings: UI scale and reduced motion. Stored in localStorage behind try/catch so
// the game still works when storage throws (private windows, blocked site data).

export interface UiSettings {
  uiScale: number;
  reducedMotion: boolean;
  /** R2D: the evening edition arrives as a line in the feed instead of a card at 21:00. */
  editionInFeed: boolean;
}

const KEY = 'qoti.settings.v1';
const DEFAULTS: UiSettings = { uiScale: 1, reducedMotion: false, editionInFeed: false };

export function clampScale(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(1.4, Math.max(0.8, Math.round(v * 20) / 20));
}

export function loadSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      uiScale: clampScale(Number(parsed.uiScale ?? 1)),
      reducedMotion: parsed.reducedMotion === true,
      editionInFeed: parsed.editionInFeed === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: UiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage is optional; the settings still apply for this visit.
  }
  applySettings(s);
}

export function applySettings(s: UiSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(clampScale(s.uiScale)));
  root.classList.toggle('reduced-motion', s.reducedMotion);
  // Large interface: the toolbar drops its labels (tooltips keep them) so it still fits.
  root.classList.toggle('ui-large', clampScale(s.uiScale) > 1.15);
}

export function applyStoredSettings(): void {
  applySettings(loadSettings());
}
