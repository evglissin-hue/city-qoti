import { useState } from 'preact/hooks';
import type { Session } from '../app/session';
import { copy } from './copy';
import { clampScale, loadSettings, saveSettings, type UiSettings } from './settings';
import { clampVolume, type AudioSettings } from '../audio/settings';
import { audioSettings, setAudioSettings } from '../audio/store';

type Quality = 'low' | 'medium' | 'high';
const QUALITY_KEY = 'qoti.quality.v1';

function loadQuality(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    return q === 'low' || q === 'high' ? q : 'medium';
  } catch {
    return 'medium';
  }
}

function saveQuality(q: Quality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    // Optional storage; the choice still applies now.
  }
}

/** Settings card: quality preset, interface size, calm motion and sound. */
export function SettingsPanel({ session }: { session: Session }) {
  const [s, setS] = useState<UiSettings>(() => loadSettings());
  const [quality, setQuality] = useState<Quality>(() => loadQuality());
  if (!session.ui.settingsOpen.value) return null;
  const update = (next: UiSettings) => {
    setS(next);
    saveSettings(next);
  };
  const pickQuality = (q: Quality) => {
    setQuality(q);
    saveQuality(q);
    session.renderer?.setQuality(q);
  };
  const options: [Quality, string][] = [
    ['low', copy.settings.qualityLow],
    ['medium', copy.settings.qualityMedium],
    ['high', copy.settings.qualityHigh],
  ];
  return (
    <div class="modal-backdrop" onClick={() => (session.ui.settingsOpen.value = false)}>
      <div
        class="panel modal settings"
        role="dialog"
        data-testid="settings"
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
            onChange={(e) => update({ ...s, reducedMotion: (e.target as HTMLInputElement).checked })}
          />
          <span>
            {copy.settings.reducedMotion} <span class="muted">{copy.settings.reducedMotionHint}</span>
          </span>
        </label>
        <SoundSettings />
        <fieldset class="keep-copy">
          <legend>{copy.settings.keepCopy}</legend>
          <p class="muted">{copy.settings.keepCopyHint}</p>
          <button type="button" data-testid="save-valley-file" onClick={() => void session.exportValley()}>
            {copy.settings.saveCopy}
          </button>
        </fieldset>
        {session.target.mode === 'solo' && <MoveOnline session={session} />}
        <div class="actions">
          <button type="button" class="primary" onClick={() => (session.ui.settingsOpen.value = false)}>
            {copy.settings.done}
          </button>
        </div>
      </div>
    </div>
  );
}

/** C5G: a volume per bus and a mute, saved in this browser. */
function SoundSettings() {
  const a = audioSettings.value;
  const sliders: [keyof Omit<AudioSettings, 'muted'>, string][] = [
    ['master', copy.settings.master],
    ['music', copy.settings.music],
    ['ambience', copy.settings.ambience],
    ['effects', copy.settings.effects],
  ];
  return (
    <fieldset class="sound" data-testid="sound-settings">
      <legend>{copy.settings.sound}</legend>
      <p class="muted">{copy.settings.soundHint}</p>
      {sliders.map(([key, label]) => (
        <label key={key} class="scale">
          {label} <strong>{Math.round(a[key] * 100)}%</strong>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(a[key] * 100)}
            disabled={a.muted}
            data-testid={`volume-${key}`}
            onInput={(e) =>
              setAudioSettings({
                ...a,
                [key]: clampVolume(Number((e.target as HTMLInputElement).value) / 100, a[key]),
              })
            }
          />
        </label>
      ))}
      <label class="check">
        <input
          type="checkbox"
          checked={a.muted}
          data-testid="mute"
          onChange={(e) => setAudioSettings({ ...a, muted: (e.target as HTMLInputElement).checked })}
        />
        <span>
          {copy.settings.mute} <span class="muted">{copy.settings.muteHint}</span>
        </span>
      </label>
    </fieldset>
  );
}

/** C4D: a solo valley can move online (C2C's import path), after a second click to be sure. */
function MoveOnline({ session }: { session: Session }) {
  const [stage, setStage] = useState<'idle' | 'sure' | 'moving' | 'failed'>('idle');
  const go = () => {
    setStage('moving');
    session.moveOnline().catch(() => setStage('failed'));
  };
  const town = session.mirror.settings.value.townName;
  return (
    <fieldset class="keep-copy" data-testid="move-online-card">
      <legend>{copy.settings.together}</legend>
      <p class="muted">
        {stage === 'sure'
          ? copy.settings.moveSure(town)
          : stage === 'failed'
            ? copy.settings.moveFailed
            : copy.settings.togetherHint}
      </p>
      {stage === 'sure' ? (
        <div class="actions">
          <button type="button" class="primary" data-testid="move-online-yes" onClick={go}>
            {copy.settings.moveYes}
          </button>
          <button type="button" onClick={() => setStage('idle')}>
            {copy.settings.moveNo}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="move-online"
          disabled={stage === 'moving'}
          onClick={() => setStage('sure')}
        >
          {stage === 'moving' ? copy.settings.moving : copy.settings.moveOnline}
        </button>
      )}
    </fieldset>
  );
}

/** The controls card, toggled with "?". */
export function HelpOverlay({ session }: { session: Session }) {
  if (!session.ui.helpOpen.value) return null;
  return (
    <div class="modal-backdrop" onClick={() => (session.ui.helpOpen.value = false)}>
      <div class="panel modal help" role="dialog" data-testid="help" onClick={(e) => e.stopPropagation()}>
        <h3>{copy.help.heading}</h3>
        <dl>
          {copy.help.rows.map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p class="muted">{copy.help.footer}</p>
      </div>
    </div>
  );
}
