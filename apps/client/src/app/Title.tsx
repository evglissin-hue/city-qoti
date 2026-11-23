// P3D: the front door. A menu of clear choices first; the form for making a valley is the second
// step. This file only composes: the pieces live in title/.
import { randomId } from '@qoti/protocol';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { copy, welcomeLine } from '../ui/copy';
import { loadProfile, saveProfile, type PlayerProfile } from './profile';
import { findOldSolo } from './oldValley';
import { listRecent, type RecentValley } from './recent';
import type { SessionTarget } from './session';
import type { ValleyFile } from './valleyFile';
import {
  forget,
  newOnline,
  newSolo,
  openImported,
  pickFile,
  takePastedInvite,
  targetOf,
  type NewValleyForm,
} from './title/actions';
import { TitleBackdrop } from './title/Backdrop';
import { Menu, type MenuPrimary } from './title/Menu';
import { NewValley } from './title/NewValley';
import { MARK_MENU, titleLight, type Framing } from './title/shared';
import { TitleSettings } from './title/TitleSettings';
import { Imported, Valleys } from './title/Valleys';
import { Wordmark } from './title/Wordmark';
import './title/title.css';

type Step = 'menu' | 'new' | 'valleys' | 'imported';

/** The page sits on the left, so the town is framed a little right of center and stays clear. */
const FRAMING: Framing = { x: 0.17, y: 0 };

export function Title({
  onStart,
  fresh = false,
}: {
  onStart: (t: SessionTarget, opts?: { invite?: boolean }) => void;
  /** P1: arrived from the chapter card, so the seed field starts on a fresh seed, in view. */
  fresh?: boolean;
}) {
  const light = useMemo(() => titleLight(), []);
  const welcome = useMemo(() => welcomeLine(), []);
  const [step, setStep] = useState<Step>(fresh ? 'new' : 'menu');
  const [mode, setMode] = useState<'online' | 'solo'>('online');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [, setListVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [imported, setImported] = useState<ValleyFile | null>(null);
  const [form, setFormState] = useState<NewValleyForm>(() => {
    const q = new URLSearchParams(location.search);
    return {
      seed: fresh ? randomSeed() : '',
      town: '',
      // ?creative starts with the creative box ticked (the I0 end to end specs play sandbox valleys).
      creative: q.has('creative'),
      economy: 'standard',
      threat: 'standard',
      // C5H: the first days guide, on by default for standard valleys (?noguide starts it unticked).
      guide: !q.has('noguide'),
    };
  });
  const setForm = (patch: Partial<NewValleyForm>) => setFormState((f) => ({ ...f, ...patch }));
  const [profile, setProfileState] = useState<PlayerProfile>(() => loadProfile());
  const setProfile = (p: PlayerProfile) => {
    setProfileState(p);
    saveProfile(p);
  };
  // R1C: solo valleys whose stored snapshot is from the old rules, found by peeking at headers.
  const [oldSolo, setOldSolo] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void findOldSolo(listRecent()).then((ids) => live && setOldSolo(ids));
    return () => {
      live = false;
    };
  }, []);

  const recent = listRecent();
  const isOld = (v: RecentValley) => v.old === true || oldSolo.includes(v.valleyId);
  const invited = recent.find((v) => v.pending);
  const listed = recent.filter((v) => !v.pending);
  const featured = listed.find((v) => !isOld(v));
  const otherCount = featured ? listed.length - 1 : listed.length;
  const primary: MenuPrimary = invited ? 'join' : featured ? 'continue' : 'new-online';

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const found = () =>
    run(async () => {
      const v = await (mode === 'online' ? newOnline(form) : newSolo(form));
      onStart(targetOf(v), mode === 'online' ? { invite: true } : undefined);
    });
  const onPickFile = (file: File | undefined) =>
    file &&
    run(async () => {
      setImported(await pickFile(file));
      setBusy(false);
      go('imported');
    });
  const openFromFile = (m: 'solo' | 'online') =>
    imported &&
    run(async () => {
      const v = await openImported(imported, m);
      onStart(targetOf(v), m === 'online' ? { invite: true } : undefined);
    });
  const forgetIt = (v: RecentValley) => {
    forget(v);
    setForgetting(null);
    setListVersion((n) => n + 1);
  };

  // Where focus goes when a step changes: the new step's heading, or the choice that opened it.
  const opener = useRef<string | null>(null);
  const shownStep = useRef<Step>('menu');
  const go = (next: Step, from?: string) => {
    if (next !== 'menu' && from) opener.current = from;
    setError(null);
    setForgetting(null);
    setStep(next);
  };
  useEffect(() => {
    const was = shownStep.current;
    shownStep.current = step;
    if (step === 'menu' && was === 'menu') return;
    const target =
      step === 'menu' && opener.current
        ? document.querySelector<HTMLElement>(`[data-testid="${opener.current}"]`)
        : document.querySelector<HTMLElement>('[data-step-heading]');
    target?.focus({ preventScroll: true });
    if (step === 'menu') opener.current = null;
  }, [step]);
  useEffect(() => {
    try {
      performance.mark(MARK_MENU);
    } catch {
      // Marks are for the boot numbers only.
    }
  }, []);

  // Enter takes the view's primary action; Escape steps back. Read through a ref so one listener
  // always sees this render's state.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (e.key === 'Escape') {
      if (settingsOpen) setSettingsOpen(false);
      else if (forgetting) setForgetting(null);
      else if (pasteOpen) setPasteOpen(false);
      else if (nameOpen) setNameOpen(false);
      else if (step !== 'menu') go('menu');
      else return;
      e.preventDefault();
      return;
    }
    if (e.key !== 'Enter' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || settingsOpen || busy) return;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A' || tag === 'SELECT' || tag === 'TEXTAREA')
      return;
    if (step === 'new') {
      e.preventDefault();
      void found();
    } else if (step === 'menu' && tag !== 'INPUT') {
      e.preventDefault();
      if (primary === 'join' && invited) onStart(targetOf(invited));
      else if (primary === 'continue' && featured) onStart(targetOf(featured));
      else {
        setMode('online');
        go('new', 'new-online');
      }
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const compact = step !== 'menu';
  return (
    <main
      class={`title-screen title-front${light === 'dusk' ? ' lamplight' : ''}`}
      data-light={light}
      data-step={step}
    >
      <TitleBackdrop light={light} framing={FRAMING} />
      <div class="tf-surface">
        <header class={`tf-head${compact ? ' is-compact' : ''}`}>
          <Wordmark />
          {!compact && (
            <>
              <p class="tagline">{copy.title.tagline}</p>
              <p class="welcome muted">{welcome}</p>
            </>
          )}
        </header>
        <div class="tf-body">
          {step === 'menu' && (
            <>
              <Menu
                primary={primary}
                invited={invited}
                featured={featured}
                otherCount={otherCount}
                profile={profile}
                onProfile={setProfile}
                busy={busy}
                nameOpen={nameOpen}
                onNameOpen={setNameOpen}
                pasteOpen={pasteOpen}
                onPasteOpen={setPasteOpen}
                onJoin={() => invited && onStart(targetOf(invited))}
                onContinue={(v) => onStart(targetOf(v))}
                onChoose={(m) => {
                  setMode(m);
                  go('new', m === 'online' ? 'new-online' : 'new-solo');
                }}
                onValleys={() => go('valleys', 'more-valleys')}
                onSettings={() => setSettingsOpen(true)}
                onFile={(f) => void onPickFile(f)}
                onPaste={(text) => {
                  const ok = takePastedInvite(text);
                  if (ok) {
                    setPasteOpen(false);
                    setListVersion((n) => n + 1);
                  }
                  return ok;
                }}
              />
              {error && (
                <p class="error tf-menu-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
          {step === 'new' && (
            <NewValley
              mode={mode}
              onMode={setMode}
              form={form}
              onForm={setForm}
              profile={profile}
              onProfile={setProfile}
              fresh={fresh}
              busy={busy}
              error={error}
              onFound={() => void found()}
              onBack={() => go('menu')}
            />
          )}
          {step === 'valleys' && (
            <Valleys
              list={listed}
              isOld={isOld}
              forgetting={forgetting}
              onForgetting={setForgetting}
              onForget={forgetIt}
              onOpen={(v) => onStart(targetOf(v))}
              onError={setError}
              busy={busy}
              error={error}
              onBack={() => go('menu')}
            />
          )}
          {step === 'imported' && imported && (
            <Imported
              imported={imported}
              busy={busy}
              error={error}
              onOpen={(m) => void openFromFile(m)}
              onBack={() => go('menu')}
            />
          )}
        </div>
      </div>
      {settingsOpen && <TitleSettings onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function randomSeed(): string {
  return randomId().slice(0, 12);
}
