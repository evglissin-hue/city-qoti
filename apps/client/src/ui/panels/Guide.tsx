import { MAP_SIZE, type GuideView } from '@qoti/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import type { RenderApi } from '../../render/api';
import { levelY } from '../../render/coords';
import { fillLetter } from '../letters';
import { guideCopy, guideShown, LANE_INK, letterParts, pointTargets, type GuideUiNow } from '../guide';
import './guide.css';

/**
 * The first days guide (C5H; docs/build/cycle-05h-first-days.md): a small card in the corner with
 * the open step and its lane, the County surveyor's letter on its own sheet (the hint as a P.S.,
 * like story letters), and soft inked arrows at the tool, book, overlay or place the step is about.
 * Hidden per seat; the progress is shared. The first letter and the farewell open by themselves.
 */
export function GuidePanel({ session }: { session: Session }) {
  const g = session.mirror.guide.value;
  const seat = session.seat;
  const [reading, setReading] = useState<number | null>(null);
  const opened = useRef(-1);
  const [farewellRead, setFarewellRead] = useState(() => readFarewell(session));
  const shown = guideShown(g, seat) && !(g.id === 'farewell' && farewellRead);
  // A new valley opens its first letter; the end opens the farewell. Other letters wait on the card.
  useEffect(() => {
    if (!shown || !g || opened.current === g.step) return;
    opened.current = g.step;
    if (g.step === 0 || g.id === 'farewell') setReading(g.step);
  }, [shown, g?.step, g?.id]);
  if (!shown || !g) return null;
  const letterOpen = reading === g.step;
  const close = () => {
    setReading(null);
    if (g.id === 'farewell') {
      setFarewellRead(true);
      saveFarewell(session);
    }
  };
  return (
    <>
      {!letterOpen && <GuideCard g={g} onOpen={() => setReading(g.step)} />}
      {letterOpen && <GuideLetter session={session} g={g} onClose={close} />}
      {!letterOpen && g.id !== 'farewell' && <GuideArrows session={session} g={g} />}
    </>
  );
}

/** The card in the corner: which letter, whose lane, and the step's hint in a line. */
function GuideCard({ g, onOpen }: { g: GuideView; onOpen: () => void }) {
  const farewell = g.id === 'farewell';
  return (
    <button
      type="button"
      class={`guide-card lane-${g.lens}`}
      data-testid="guide-card"
      data-step={g.id}
      style={{ '--lane': LANE_INK[g.lens] }}
      aria-label={`${guideCopy.open}: ${farewell ? guideCopy.farewell : guideCopy.cardStep(g.step, g.of)}`}
      onClick={onOpen}
    >
      <span class="guide-lane" aria-hidden="true" />
      <span class="guide-card-body">
        <span class="guide-card-meta">
          {farewell ? guideCopy.farewell : guideCopy.cardStep(g.step, g.of)}
          {!farewell && <span class="guide-card-lane">, {guideCopy.lane[g.lens]}</span>}
        </span>
        {!farewell && <span class="guide-card-hint">{g.hint}</span>}
        <span class="guide-dots" aria-hidden="true">
          {g.done.map((d, i) => (
            <i key={i} class={d ? 'done' : i === g.step ? 'open' : ''} />
          ))}
        </span>
      </span>
    </button>
  );
}

/** The surveyor's letter, borrowed from the story letter sheet. */
function GuideLetter({ session, g, onClose }: { session: Session; g: GuideView; onClose: () => void }) {
  const town = session.mirror.settings.value.townName;
  const me = session.mirror.seats.value.find((s) => s.seat === session.seat);
  const { salutation, body, signature } = letterParts(fillLetter(g.letter, town, me?.name || 'neighbor'));
  const farewell = g.id === 'farewell';
  const skip = () => {
    session.submit({ t: 'guide.setHidden', on: true });
    onClose();
  };
  return (
    <div class="modal-backdrop letter-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        class={`away-letter story-letter guide-letter lane-${g.lens}`}
        role="dialog"
        aria-label="A letter from the County surveyor"
        data-testid="guide-letter"
        data-step={g.id}
      >
        <span class="postage guide-postage" aria-hidden="true">
          <span class="postage-initial">T</span>
          <span class="guide-stamp-lane" style={{ '--lane': LANE_INK[g.lens] }} />
        </span>
        <p class="letter-meta">
          {farewell ? guideCopy.farewell : guideCopy.cardStep(g.step, g.of)}
          {!farewell && <span>, {guideCopy.lane[g.lens]}</span>}
        </p>
        <p class="letter-salutation">{salutation}</p>
        {body.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        {signature && (
          <p class="letter-signoff">
            <span class="signature">{signature}</span>
          </p>
        )}
        {g.hint && (
          <p class="letter-ps" data-testid="guide-ps">
            P.S. {g.hint}
          </p>
        )}
        <div class="actions">
          {g.step === 0 && !farewell && (
            <button
              type="button"
              class="link guide-skip"
              data-testid="guide-skip"
              title={guideCopy.skipHint}
              onClick={skip}
            >
              {guideCopy.skip}
            </button>
          )}
          <button type="button" class="primary" data-testid="guide-letter-close" onClick={onClose}>
            {farewell ? guideCopy.done : guideCopy.close}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Mark {
  key: string;
  /** Pulsing outline around an element, client pixels. */
  box?: { x: number; y: number; w: number; h: number };
  /** Pulsing ring on the ground. */
  ring?: { x: number; y: number };
  /** The arrow's tip and the way it travels (radians, screen axes: 0 right, pi/2 down). */
  tip: { x: number; y: number; dir: number };
}

/**
 * Soft inked arrows: at the button, book or overlay the step names (or the way to it), and at the
 * place on the map (the start, the gate, the storehouse), with a pulsing outline at each. Gone
 * once the step is done or the thing is open; redrawn each frame so they follow the camera.
 */
function GuideArrows({ session, g }: { session: Session; g: GuideView }) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const frame = useRef(0);
  const view = useRef(g);
  view.current = g;
  useEffect(() => {
    const step = () => {
      frame.current = requestAnimationFrame(step);
      const next = arrowMarks(session, view.current);
      setMarks((m) => (sameMarks(m, next) ? m : next));
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [session]);
  return (
    <div class="guide-layer" aria-hidden="true">
      {marks.map((m) => (
        <span key={m.key}>
          {m.box && (
            <span
              class="guide-outline"
              data-testid="guide-outline"
              style={{ left: m.box.x, top: m.box.y, width: m.box.w, height: m.box.h }}
            />
          )}
          {m.ring && <span class="guide-ring" style={{ left: m.ring.x, top: m.ring.y }} />}
          <svg
            class="guide-arrow"
            data-testid="guide-arrow"
            data-target={m.key}
            viewBox="-64 -24 72 48"
            style={{
              left: m.tip.x,
              top: m.tip.y,
              transform: `rotate(${(m.tip.dir * 180) / Math.PI}deg)`,
            }}
          >
            <path class="shaft" d="M-60 -10 C-44 -22 -24 8 -6 0" />
            <path class="head" d="M-16 -8 L-4 0 L-16 9" />
          </svg>
        </span>
      ))}
    </div>
  );
}

const PAD = 6;
const EDGE = 44;

/** Where the arrows go this frame. */
function arrowMarks(session: Session, g: GuideView): Mark[] {
  const ui = session.ui;
  const now: GuideUiNow = {
    lens: ui.lens.value,
    panel: ui.panel.value,
    overlay: ui.overlay.value,
    tool: session.tools?.active.value ?? null,
    overlayListOpen: !!document.querySelector('[data-testid="overlay-list"]'),
  };
  const out: Mark[] = [];
  // A letter, the Settings card or a dialog over the valley: no arrows until it is put away.
  if (document.querySelector('.modal-backdrop')) return out;
  for (const id of pointTargets(g, now)) {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const r = el?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) continue;
    // Toolbar buttons sit low: come in from above. Anything near the top: come in from below.
    const fromBelow = r.top < 140;
    out.push({
      key: id,
      box: { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 },
      tip: {
        x: r.left + r.width / 2,
        y: fromBelow ? r.bottom + PAD + 2 : r.top - PAD - 2,
        dir: fromBelow ? -Math.PI / 2 : Math.PI / 2,
      },
    });
    break;
  }
  const tile = g.point?.tile;
  const api = session.renderer as unknown as Partial<RenderApi> | null;
  if (tile && api?.project) {
    const [tx, tz] = tile;
    const x = Math.max(0, Math.min(MAP_SIZE - 1, tx));
    const z = Math.max(0, Math.min(MAP_SIZE - 1, tz));
    const p = api.project.call(api, x + 0.5, levelY(session.mirror.height(x, z)), z + 0.5);
    if (p) {
      const w = innerWidth;
      const h = innerHeight;
      if (p.onScreen) {
        out.push({ key: 'tile', ring: { x: p.x, y: p.y }, tip: { x: p.x, y: p.y - 16, dir: Math.PI / 2 } });
      } else {
        // Off screen: a small arrow at the edge, pointing the way.
        const angle = Math.atan2(p.y - h / 2, p.x - w / 2);
        out.push({
          key: 'tile',
          tip: {
            x: Math.min(w - EDGE, Math.max(EDGE, p.x)),
            y: Math.min(h - EDGE, Math.max(EDGE + 40, p.y)),
            dir: angle,
          },
        });
      }
    }
  }
  return out;
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.key !== y.key || Math.abs(x.tip.x - y.tip.x) > 0.5 || Math.abs(x.tip.y - y.tip.y) > 0.5)
      return false;
    if (Math.abs((x.box?.w ?? 0) - (y.box?.w ?? 0)) > 0.5) return false;
  }
  return true;
}

/** Settings: show or hide the guide for this seat only. Only while the guide is still running. */
export function GuideSetting({ session }: { session: Session }) {
  const g = session.mirror.guide.value;
  if (!g || g.over) return null;
  const on = !g.hidden[session.seat];
  return (
    <label class="check">
      <input
        type="checkbox"
        checked={on}
        data-testid="guide-setting"
        onChange={(e) =>
          session.submit({ t: 'guide.setHidden', on: !(e.target as HTMLInputElement).checked })
        }
      />
      <span>
        {guideCopy.show} <span class="muted">{guideCopy.settingsHint}</span>
      </span>
    </label>
  );
}

const FAREWELL_KEY = 'qoti.guide.farewell.v1';

/** Whether this browser already read the farewell in this valley (a per-viewer nicety). */
function readFarewell(session: Session): boolean {
  try {
    const seen = JSON.parse(localStorage.getItem(FAREWELL_KEY) ?? '[]') as unknown;
    return Array.isArray(seen) && seen.includes(session.target.valleyId);
  } catch {
    return false;
  }
}

function saveFarewell(session: Session): void {
  try {
    const seen = JSON.parse(localStorage.getItem(FAREWELL_KEY) ?? '[]') as unknown;
    const list = Array.isArray(seen) ? (seen as string[]).slice(-49) : [];
    if (!list.includes(session.target.valleyId)) list.push(session.target.valleyId);
    localStorage.setItem(FAREWELL_KEY, JSON.stringify(list));
  } catch {
    // Optional storage: the farewell may show again next visit.
  }
}
