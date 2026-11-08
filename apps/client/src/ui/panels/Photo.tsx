// I3 (C5F): photo mode and the together note. Photo mode hides the interface but for a slim strip
// (depth of field, time of day, save a PNG, Esc back) and frees the camera; the render side is C5E's
// (`photo` on the renderer). Until it lands, the strip still hides the interface and saves the
// canvas as it is. The together note is a quiet line while both seats share a moment.
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { photoApi, savePhoto } from '../../app/snapshots';

export function TogetherNote({ session }: { session: Session }) {
  const text = session.ui.together.value;
  if (!text || session.ui.photo.value) return null;
  return (
    <div class="together-note panel" role="status" data-testid="together-note">
      <span class="together-hearts" aria-hidden="true">
        ♥♥
      </span>
      <span>{text}</span>
      <button type="button" class="close" title="Close" onClick={() => (session.ui.together.value = null)}>
        ×
      </button>
    </div>
  );
}

export function PhotoStrip({ session }: { session: Session }) {
  const [focus, setFocus] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  if (!session.ui.photo.value) return null;
  const api = photoApi(session);
  const exit = () => (session.ui.photo.value = false);
  const save = async () => {
    setSaving(true);
    try {
      await savePhoto(session);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div class="photo-strip panel" role="toolbar" aria-label="Photo mode" data-testid="photo-strip">
      <span class="photo-title">Photo mode</span>
      <label
        class="photo-slider"
        title={api?.setDepthOfField ? 'Blur near and far' : 'Depth of field comes with the new renderer'}
      >
        Depth of field
        <input
          type="range"
          min={0}
          max={100}
          value={focus}
          disabled={!api?.setDepthOfField}
          data-testid="photo-dof"
          onInput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            setFocus(v);
            api?.setDepthOfField?.(v / 100);
          }}
        />
      </label>
      <label class="photo-slider" title="Only the picture's light changes; the valley's clock keeps time">
        Time of day {hour === null ? '(now)' : `${String(hour).padStart(2, '0')}:00`}
        <input
          type="range"
          min={0}
          max={24}
          value={hour ?? 24}
          disabled={!api?.setTimeOfDay}
          data-testid="photo-time"
          onInput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            const h = v >= 24 ? null : v;
            setHour(h);
            api?.setTimeOfDay?.(h);
          }}
        />
      </label>
      <button
        type="button"
        class="primary"
        data-testid="photo-save"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? 'Developing' : 'Save PNG'}
      </button>
      <button type="button" class="ghost-button" data-testid="photo-exit" onClick={exit}>
        Back (Esc)
      </button>
    </div>
  );
}
