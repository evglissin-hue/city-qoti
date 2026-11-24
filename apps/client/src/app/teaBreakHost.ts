// V4C: tea-break mode's host (docs/spec/17-presentation.md, Visual direction, 6; V4 wave notes, Tea
// break and the camera). It pokes the idle timer from every key, click, drag, wheel, touch and real
// pointer move on the window, asks it a few times a second whether a tea break is due, and runs one:
// it keeps the player's view (`saveView`), follows a resident on their evening round or circles the
// day's busiest place with the camera's slow glide, and on the first input of any kind puts the
// view back exactly (`restoreView`) before that input acts, since its listeners run first (the
// window's capture phase). Each seat's tea break is its own: it reads the Mirror, moves this seat's
// camera and sends nothing, no command and no message.
import { AGENT_STRIDE, AgentField } from '@qoti/sim';
import type { CameraView } from '../input/camera';
import {
  chooseTeaBreak,
  FOLLOW_DISTANCE,
  IdleTimer,
  ORBIT_SPEED,
  type TeaBreakGuards,
  type TeaBreakPlan,
  waitingOnPlayer,
} from '../input/teaBreak';
import { measureState } from '../ui/panels/Measure';
import { loadSettings } from '../ui/settings';
import { DEBUG } from './debug';
import type { Session } from './session';

/** How often the host asks whether a tea break is due, and minds a running one. */
const CHECK_MS = 250;
/** A followed resident out of sight (indoors) this long: the busiest place instead of a door. */
const INDOORS_MS = 12_000;
/** A follow this long: someone else, or the busiest place once the round is over. */
const FOLLOW_MAX_MS = 150_000;
/** About one full turn about a place, then somewhere else (or someone, of an evening). */
const ORBIT_MAX_MS = 120_000;
/** A pointer that wanders less than this many pixels is a hand resting on the mouse, not input. */
const MOVE_PX = 4;
/** The still look's pitch with reduced motion, as the circle's. */
const STILL_PITCH = Math.PI / 4;
/** Input that ends a tea break and starts the idle count over. */
const INPUTS = ['keydown', 'pointerdown', 'wheel', 'touchstart', 'gesturestart'] as const;

/** What a running tea break is doing, for tests (`window.__qotiTeaBreak.state()`). */
export interface TeaBreakState {
  plan: TeaBreakPlan;
  /** Reduced motion: one cut to the busiest place, then nothing moves. */
  still: boolean;
  saved: CameraView;
}

export class TeaBreakHost {
  readonly timer: IdleTimer;
  private running: (TeaBreakState & { since: number; lostAt: number | null }) | null = null;
  /** Test time added to the clock (`skip`), so a test can idle 90 s without waiting them out. */
  private skew = 0;
  private pointer: { x: number; y: number } | null = null;
  private interval: ReturnType<typeof setInterval> | 0 = 0;
  private readonly cleanup: (() => void)[] = [];
  /** Automation (Playwright) runs scripted cameras for minutes: no tea break unless the URL asks. */
  private readonly automated =
    typeof navigator !== 'undefined' &&
    navigator.webdriver === true &&
    !new URLSearchParams(location.search).has('teabreak');

  constructor(private readonly session: Session) {
    this.timer = new IdleTimer(this.now());
  }

  now(): number {
    return performance.now() + this.skew;
  }

  /** The guards, read live each time the timer asks. */
  readonly guards: TeaBreakGuards = {
    enabled: () => !this.automated && loadSettings().teaBreak,
    toolInHand: () => (this.session.tools?.active.value ?? 'inspect') !== 'inspect',
    cardOpen: () => this.openCards().length > 0 || this.waiting().length > 0,
    busy: () =>
      this.session.phase.value !== 'ready' ||
      !this.session.renderer ||
      !this.session.tools ||
      this.session.ui.photo.value ||
      this.session.ui.following.value !== null ||
      (typeof document !== 'undefined' && document.visibilityState === 'hidden'),
  };

  /** The names of UiState's open cards, books, letters and dialogs (none: nothing is open). */
  openCards(): string[] {
    const ui = this.session.ui;
    const open: [string, boolean][] = [
      ['selection', ui.selection.value !== null],
      ['panel', ui.panel.value !== null],
      ['dialog', ui.dialog.value !== null],
      ['letter', ui.letter.value !== null],
      ['storyLetter', ui.storyLetter.value !== null],
      ['almanac', ui.almanac.value !== null],
      ['raidCard', ui.raidCard.value !== null],
      ['festivalCard', ui.festivalCard.value !== null],
      ['edition', ui.edition.value !== null],
      ['chapter', ui.chapter.value],
      ['settingsOpen', ui.settingsOpen.value],
      ['inviteOpen', ui.inviteOpen.value],
      ['helpOpen', ui.helpOpen.value],
      ['asking', ui.asking.value],
      ['rankUp', ui.rankUp.value !== null],
      ['customize', ui.customize.value !== null],
      ['sketch', ui.sketch.value !== null],
      ['festivalDraft', ui.festivalDraft.value !== null],
      ['postureDraft', ui.postureDraft.value !== null],
      ['measure', measureState.value.k !== 'closed'],
      ['emoteOpen', ui.emoteOpen.value],
    ];
    return open.filter(([, on]) => on).map(([name]) => name);
  }

  /** What is on screen waiting for the player's answer (a raid, captives, a dialog); see `waitingOnPlayer`. */
  waiting(): string[] {
    return waitingOnPlayer(this.session);
  }

  /**
   * Starts listening and checking; returns the host, which stops itself when the canvas goes. Under
   * automation without `teabreak` in the URL it installs nothing but the debug hook: no listener, no
   * check, so a spec that does not ask for tea breaks runs exactly as it would without them.
   */
  install(): this {
    if (DEBUG) this.installDebug();
    if (this.automated) return this;
    const onInput = (e: Event) => this.input(e);
    for (const type of INPUTS) {
      addEventListener(type, onInput, { capture: true, passive: true });
      this.cleanup.push(() => removeEventListener(type, onInput, { capture: true }));
    }
    const onMove = (e: PointerEvent) => {
      const p = this.pointer;
      this.pointer = { x: e.clientX, y: e.clientY };
      if (p && Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) < MOVE_PX) {
        // Jitter: keep the old spot, so a slow drift still adds up to a move.
        this.pointer = p;
        return;
      }
      if (p) this.input(e);
    };
    addEventListener('pointermove', onMove, { capture: true, passive: true });
    this.cleanup.push(() => removeEventListener('pointermove', onMove, { capture: true }));
    this.interval = setInterval(() => this.check(), CHECK_MS);
    return this;
  }

  /** `window.__qotiTeaBreak` (with `?debug`), for specs and the console. */
  private installDebug(): void {
    (window as unknown as { __qotiTeaBreak?: unknown }).__qotiTeaBreak = {
      /** Moves the tea break's clock on, as if `ms` passed without input; then checks. */
      skip: (ms: number) => {
        this.skew += ms;
        this.check();
      },
      check: () => this.check(),
      state: () => this.state,
      idleFor: () => this.timer.idleFor(this.now()),
      due: () => this.timer.due(this.now(), this.guards),
      /** Each guard's answer now, to see what holds a tea break back. */
      guards: () => ({
        enabled: this.guards.enabled(),
        toolInHand: this.guards.toolInHand(),
        cardOpen: this.guards.cardOpen(),
        busy: this.guards.busy(),
        open: this.openCards(),
        waiting: this.waiting(),
      }),
    };
  }

  /** The running tea break, or null. */
  get state(): TeaBreakState | null {
    const r = this.running;
    return r ? { plan: r.plan, still: r.still, saved: { ...r.saved } } : null;
  }

  /** Any input: the view goes back first, then the input acts on it. */
  input(e?: Event): void {
    void e;
    this.timer.poke(this.now());
    if (this.running) this.end();
  }

  /** Starts a tea break when one is due, and minds a running one. */
  check(): void {
    const renderer = this.session.renderer;
    if (renderer && !renderer.canvas.isConnected) {
      this.dispose();
      return;
    }
    const now = this.now();
    if (this.running) {
      this.mind(now);
      return;
    }
    if (!renderer || !this.timer.due(now, this.guards)) return;
    const rig = renderer.rig;
    const still = this.reducedMotion();
    const look = rig.look;
    const plan = chooseTeaBreak(this.session.mirror, { near: look, noFollow: still });
    if (!plan) return;
    this.running = { plan, still, saved: rig.saveView(), since: now, lostAt: null };
    this.session.ui.teaBreak.value = true;
    this.begin(plan);
  }

  private reducedMotion(): boolean {
    return (this.session.renderer?.rig.reducedMotion ?? false) || loadSettings().reducedMotion;
  }

  /** Points the camera at a plan: a slow follow or a slow circle; with reduced motion, one cut. */
  private begin(plan: TeaBreakPlan): void {
    const r = this.session.renderer;
    const run = this.running;
    if (!r || !run) return;
    const rig = r.rig;
    if (run.still) {
      if (plan.kind !== 'orbit') return;
      rig.restoreView({
        x: plan.x,
        z: plan.z,
        yaw: run.saved.yaw,
        pitch: STILL_PITCH,
        distance: plan.distance,
      });
      return;
    }
    rig.setDrift(true);
    if (plan.kind === 'follow') {
      rig.orbit(null);
      const at = this.whereIs(plan.residentId);
      if (at) rig.focus(at.x, at.z, FOLLOW_DISTANCE, STILL_PITCH);
      r.follow(plan.residentId);
    } else {
      r.follow(null);
      rig.orbit({ x: plan.x, z: plan.z, distance: plan.distance, speed: ORBIT_SPEED });
    }
  }

  /** Where a resident is in the latest agent frame, or null while they are indoors. */
  private whereIs(id: number): { x: number; z: number } | null {
    const L = this.session.mirror.agents.latest;
    for (let o = 0; o + AGENT_STRIDE <= L.length; o += AGENT_STRIDE)
      if (L[o + AgentField.id] === id) return { x: L[o + AgentField.x]!, z: L[o + AgentField.z]! };
    return null;
  }

  /**
   * A running tea break: a follow whose resident has been indoors a while, or left the valley, goes
   * to the busiest place rather than stare at a door; a long follow or a full circle moves on to
   * someone or somewhere else. A still look (reduced motion) stays put.
   */
  private mind(now: number): void {
    // Something asking the player for an answer (a raid begins, a dialog opens): the view goes back
    // at once, so the question is asked of the view the player left.
    if (this.waiting().length > 0) {
      this.end();
      return;
    }
    const run = this.running!;
    if (run.still) return;
    const plan = run.plan;
    let next: TeaBreakPlan | null | undefined;
    if (plan.kind === 'follow') {
      const gone = !this.session.mirror.residents.has(plan.residentId);
      const seen = !gone && this.whereIs(plan.residentId) !== null;
      run.lostAt = seen ? null : (run.lostAt ?? now);
      if (gone || (run.lostAt !== null && now - run.lostAt >= INDOORS_MS))
        next = chooseTeaBreak(this.session.mirror, { previous: plan, noFollow: true });
      else if (now - run.since >= FOLLOW_MAX_MS)
        next = chooseTeaBreak(this.session.mirror, { previous: plan, near: this.session.renderer?.rig.look });
    } else if (now - run.since >= ORBIT_MAX_MS) {
      next = chooseTeaBreak(this.session.mirror, { previous: plan, near: this.session.renderer?.rig.look });
    }
    if (next === undefined) return;
    if (next === null) {
      // Nothing else to watch: a follow with nowhere to go holds; a circle keeps turning.
      run.since = now;
      return;
    }
    run.plan = next;
    run.since = now;
    run.lostAt = null;
    this.begin(next);
  }

  /** Puts the player's view back exactly and stops watching. */
  end(): void {
    const run = this.running;
    this.running = null;
    this.session.ui.teaBreak.value = false;
    const r = this.session.renderer;
    if (!run || !r) return;
    if (run.plan.kind === 'follow') r.follow(null);
    r.rig.orbit(null);
    r.rig.setDrift(false);
    r.rig.restoreView(run.saved);
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = 0;
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
    this.running = null;
    this.session.ui.teaBreak.value = false;
  }
}

/** Starts the session's tea breaks (one line in `Session.mount`); it stops itself with the renderer. */
export function startTeaBreak(session: Session): TeaBreakHost {
  return new TeaBreakHost(session).install();
}
