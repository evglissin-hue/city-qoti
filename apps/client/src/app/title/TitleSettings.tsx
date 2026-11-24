import { useEffect, useRef, useState } from 'preact/hooks';
import { copy } from '../../ui/copy';
import { SoundSettings } from '../../ui/SettingsPanel';
import { clampScale, loadSettings, saveSettings, type UiSettings } from '../../ui/settings';
import { isQuality, type Quality } from '../../render/quality';
import { initialQuality } from '../quality';
import { backdrop } from './shared';

const QUALITY_KEY = 'qoti.quality.v1';

/** The settings the title can offer before any valley exists: picture, interface size, motion, sound. */
export function TitleSettings({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<UiSettings>(() => loadSettings());
  const [quality, setQuality] = useState<Quality>(() => initialQuality());
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus({ preventScroll: true }), []);
  const update = (next: UiSettings) => {
    setS(next);
    saveSettings(next);
  };
  const pickQuality = (q: Quality) => {
    if (!isQuality(q)) return;
    setQuality(q);
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      // Optional storage; the choice still applies now.
    }
    backdrop.current?.setQuality(q);
  };
  const options: [Quality, string][] = [
    ['low', copy.settings.qualityLow],
    ['medium', copy.settings.qualityMedium],
    ['high', copy.settings.qualityHigh],
    ['ultra', copy.settings.qualityUltra],
  ];
  return (
    <div class="modal-backdrop tf-modal-backdrop" onClick={onClose}>
      <div
        ref={card}
        tabIndex={-1}
        class="panel modal settings"
        role="dialog"
        aria-modal="true"
        aria-label={copy.settings.heading}
        data-testid="title-settings"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{copy.settings.heading}</h3>
        <fieldset class="quality">
          <legend>{copy.settings.quality}</legend>
          {options.map(([q, label]) => (
            <button
              key={q}
              type="button"
              class={quality === q ? 'active' : ''}
              data-testid={`quality-${q}`}
              onClick={() => pickQuality(q)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <label class="scale">
          {copy.settings.uiScale} <strong>{Math.round(s.uiScale * 100)}%</strong>
          <input
            type="range"
            min={80}
            max={140}
            step={5}
            value={Math.round(s.uiScale * 100)}
            data-testid="ui-scale"
            onInput={(e) =>
              update({ ...s, uiScale: clampScale(Number((e.target as HTMLInputElement).value) / 100) })
            }
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={s.reducedMotion}
            data-testid="reduced-motion"
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              update({ ...s, reducedMotion: on });
              backdrop.current?.setCalm(on);
            }}
          />
          <span>
            {copy.settings.reducedMotion} <span class="muted">{copy.settings.reducedMotionHint}</span>
          </span>
        </label>
        <SoundSettings />
        <div class="actions">
          <button type="button" class="primary" data-testid="title-settings-done" onClick={onClose}>
            {copy.settings.done}
          </button>
        </div>
      </div>
    </div>
  );
}
