import { content } from '@qoti/content';
import { MAP_SIZE, MAX_NOTE_CHARS, TICKS_PER_DAY, type RequestAsk, type RequestView } from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import type { Mirror } from '../../state/mirror';
import { buildingName, dayDate, goodName, seatLabel } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import { dayOf, goodOrder } from '../village';
import { Meter } from './parts';
import { Stepper } from './villageParts';

/** The building nearest a tile, for "around the well". */
function nearestBuilding(m: Mirror, x: number, z: number): string | null {
  let best: { d: number; def: string } | null = null;
  for (const b of m.buildings.values()) {
    const d = Math.abs(b.x - x) + Math.abs(b.z - z);
    if (d <= 10 && (!best || d < best.d)) best = { d, def: b.def };
  }
  return best ? buildingName(best.def).toLowerCase() : null;
}

/** A request in the valley's words ("12 cheese at the market stall by Spring 4"). */
export function askText(m: Mirror, ask: RequestAsk): string {
  if (ask.kind === 'text') return ask.text;
  if (ask.kind === 'charm') {
    const near = nearestBuilding(m, ask.x, ask.z);
    return `Make it lovelier ${near ? `around the ${near}` : 'over there'} (charm ${ask.target})`;
  }
  const at = ask.at ? m.buildings.get(ask.at) : undefined;
  const where = at ? ` at the ${buildingName(at.def).toLowerCase()}` : ' in store';
  const label = content.goodById.get(ask.good)?.label ?? goodName(ask.good).toLowerCase();
  return `${ask.qty} ${label}${where} by ${dayDate(ask.byDay)}`;
}

function focusAsk(session: Session, r: RequestView): void {
  const a = r.ask;
  if (a.kind === 'charm') {
    session.render?.focus(a.x, a.z);
    session.render?.highlight?.({ x: a.x, z: a.z, radius: a.radius, tone: 'hearth' });
  } else if (a.kind === 'goods' && a.at) {
    const b = session.mirror.buildings.get(a.at);
    if (b) {
      session.render?.focus(b.x, b.z);
      session.ui.selection.value = { kind: 'building', id: b.id };
    }
  }
}

const SHOWN = 4;

/**
 * Requests between the two seats (docs/spec/16-coop.md): goods by a day, charm around a spot, or
 * a plain note. Lives in the left feed; the partner's requests to you sit on top.
 */
export function RequestsPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.villageRevision.value;
  const open = session.ui.requestsOpen.value;
  const asking = session.ui.asking.value;
  const now = m.tick.value;
  const all = [...m.requests.values()];
  const live = all
    .filter((r) => r.status === 'open')
    .sort((a, b) => Number(a.from === session.seat) - Number(b.from === session.seat) || b.tick - a.tick);
  const closed = all
    .filter((r) => r.status !== 'open' && now - r.closedTick < TICKS_PER_DAY)
    .sort((a, b) => b.closedTick - a.closedTick);
  const forMe = live.filter((r) => r.from !== session.seat).length;
  return (
    <section class="panel requests" data-testid="requests">
      <header>
        <h3>Requests</h3>
        {forMe > 0 && (
          <span class="alert-count for-me" title="Asked of you">
            {forMe}
          </span>
        )}
        <button
          type="button"
          class="small-button ask"
          data-testid="request-ask"
          aria-pressed={asking}
          onClick={() => {
            session.ui.asking.value = !asking;
            session.ui.requestsOpen.value = true;
          }}
        >
          {asking ? 'Never mind' : '+ Ask'}
        </button>
        <button
          type="button"
          class="close"
          title={open ? 'Fold away' : 'Unfold'}
          onClick={() => (session.ui.requestsOpen.value = !open)}
        >
          {open ? '−' : '+'}
        </button>
      </header>
      {open && (
        <>
          {asking && <AskForm session={session} />}
          {live.length === 0 && closed.length === 0 && !asking && (
            <p class="muted small">Nothing asked. Need bread by Friday, or a prettier corner? Ask.</p>
          )}
          <ul class="request-list">
            {live.slice(0, SHOWN).map((r) => (
              <RequestItem key={r.id} session={session} r={r} />
            ))}
            {closed.slice(0, 2).map((r) => (
              <RequestItem key={r.id} session={session} r={r} />
            ))}
          </ul>
          {live.length > SHOWN && <p class="muted small more">and {live.length - SHOWN} more open</p>}
        </>
      )}
    </section>
  );
}

function RequestItem({ session, r }: { session: Session; r: RequestView }) {
  const m = session.mirror;
  const seats = m.seats.value;
  const mine = r.from === session.seat;
  const from = seats.find((s) => s.seat === r.from);
  const color = from ? `#${from.color.toString(16).padStart(6, '0')}` : 'var(--river)';
  const late = r.ask.kind === 'goods' && r.status === 'open' && dayOf(m.tick.value) > r.ask.byDay;
  const placed = r.ask.kind === 'charm' || (r.ask.kind === 'goods' && !!r.ask.at);
  return (
    <li
      class={`request ${mine ? 'mine' : 'for-me'} status-${r.status}`}
      style={{ '--seat': color }}
      data-testid={`request-${r.id}`}
    >
      <p class="request-who">
        <i class="seat-dot" />
        {mine ? 'You asked' : `${seatLabel(seats, r.from, session.seat)} asks`}
        {r.status === 'done' && <span class="request-done"> · done</span>}
        {r.status === 'withdrawn' && <span class="muted"> · withdrawn</span>}
        {late && <span class="request-late"> · running late</span>}
      </p>
      <button
        type="button"
        class="request-text"
        disabled={!placed}
        title={placed ? 'Show me where' : undefined}
        onClick={() => focusAsk(session, r)}
      >
        {r.ask.kind === 'goods' && <GoodIcon good={r.ask.good} />}
        {r.ask.kind === 'charm' && <Glyph id="charm" />}
        <span>{askText(m, r.ask)}</span>
      </button>
      {r.progress && r.status === 'open' && (
        <Meter
          value={r.progress.value / Math.max(1, r.progress.target)}
          note={`${Math.min(r.progress.value, r.progress.target)} of ${r.progress.target}`}
          tone={r.ask.kind === 'charm' ? 'sage' : 'ochre'}
        />
      )}
      {r.status === 'open' && (
        <div class="row-actions">
          {mine ? (
            <button
              type="button"
              class="small-button"
              data-testid={`request-withdraw-${r.id}`}
              onClick={() => session.submit({ t: 'request.resolve', id: r.id, status: 'withdrawn' })}
            >
              Withdraw
            </button>
          ) : null}
          <button
            type="button"
            class="small-button done"
            data-testid={`request-done-${r.id}`}
            onClick={() => session.submit({ t: 'request.resolve', id: r.id, status: 'done' })}
          >
            <Glyph id="check" /> {mine ? 'Got it' : 'Done'}
          </button>
        </div>
      )}
    </li>
  );
}

type Kind = RequestAsk['kind'];

/** The little form: goods (what, how many, by when, where), charm around the view, or a note. */
export function AskForm({ session }: { session: Session }) {
  const m = session.mirror;
  const standard = m.settings.value.mode === 'standard';
  const [kind, setKind] = useState<Kind>(standard ? 'goods' : 'text');
  const goods = content.goods.map((g) => g.id).sort(goodOrder);
  const [good, setGood] = useState('bread');
  const [qty, setQty] = useState(10);
  const [days, setDays] = useState(2);
  const outlets = [...m.buildings.values()]
    .filter((b) => b.stage === 'built' && ['market-stall', 'storehouse'].includes(b.def))
    .sort((a, b) => a.id - b.id);
  const [at, setAt] = useState(0);
  const [radius, setRadius] = useState(4);
  const [target, setTarget] = useState(50);
  const [text, setText] = useState('');
  const send = (ask: RequestAsk) => {
    session.submit({ t: 'request.add', ask });
    session.ui.asking.value = false;
  };
  const submit = (e: Event) => {
    e.preventDefault();
    if (kind === 'goods') {
      send({ kind: 'goods', good, qty, byDay: dayOf(m.tick.value) + days, at });
    } else if (kind === 'charm') {
      const c = viewCenter(session);
      send({ kind: 'charm', x: c[0], z: c[1], radius, target });
    } else if (text.trim()) {
      send({ kind: 'text', text: text.trim() });
    }
  };
  return (
    <form class="ask-form" data-testid="ask-form" onSubmit={submit}>
      <div class="dial small ask-kinds" role="radiogroup" aria-label="What kind of request">
        {(
          [
            ['goods', 'Goods'],
            ['charm', 'Charm'],
            ['text', 'A note'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            class={kind === k ? 'active' : ''}
            disabled={k !== 'text' && !standard}
            data-testid={`ask-${k}`}
            onClick={() => setKind(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === 'goods' && (
        <>
          <div class="good-pick" role="radiogroup" aria-label="Good">
            {goods.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={good === g}
                class={good === g ? 'active' : ''}
                title={goodName(g)}
                data-testid={`ask-good-${g}`}
                onClick={() => setGood(g)}
              >
                <GoodIcon good={g} />
              </button>
            ))}
          </div>
          <p class="lever-line">
            <span>{goodName(good)}</span>
            <Stepper
              value={qty}
              min={1}
              max={200}
              step={qty < 20 ? 1 : 5}
              testid="ask-qty"
              onChange={setQty}
            />
          </p>
          <p class="lever-line">
            <span>By</span>
            <Stepper
              value={days}
              min={0}
              max={12}
              step={1}
              testid="ask-days"
              format={(d) => dayDate(dayOf(m.tick.value) + d)}
              onChange={setDays}
            />
          </p>
          <p class="lever-line">
            <span>Where</span>
            <select
              value={at}
              data-testid="ask-at"
              onChange={(e) => setAt(Number((e.target as HTMLSelectElement).value))}
            >
              <option value={0}>anywhere in store</option>
              {outlets.map((b) => (
                <option key={b.id} value={b.id}>
                  {buildingName(b.def).toLowerCase()} ({b.x}, {b.z})
                </option>
              ))}
            </select>
          </p>
        </>
      )}
      {kind === 'charm' && (
        <>
          <p class="small muted">Around the middle of your view. Move the camera to choose the spot.</p>
          <p class="lever-line">
            <span>Reach</span>
            <Stepper
              value={radius}
              min={2}
              max={8}
              step={1}
              testid="ask-radius"
              format={(v) => `${v} tiles`}
              onChange={setRadius}
            />
          </p>
          <p class="lever-line">
            <span>Charm of at least</span>
            <Stepper value={target} min={10} max={90} step={5} testid="ask-target" onChange={setTarget} />
          </p>
        </>
      )}
      {kind === 'text' && (
        <textarea
          rows={2}
          maxLength={MAX_NOTE_CHARS}
          placeholder="More benches by the river, please."
          value={text}
          data-testid="ask-text"
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
      )}
      <div class="row-actions">
        <span class="spacer" />
        <button
          type="submit"
          class="primary small-button"
          data-testid="ask-send"
          disabled={kind === 'text' && !text.trim()}
        >
          Send the request
        </button>
      </div>
    </form>
  );
}

/** The tile in the middle of the view (the start area's middle when the renderer cannot say). */
function viewCenter(session: Session): [number, number] {
  const pick = session.render?.pickTile(innerWidth / 2, innerHeight / 2);
  if (pick) return [pick.x, pick.z];
  const [x0, z0, x1, z1] = session.mirror.meta.startArea;
  const clamp = (v: number) => Math.max(0, Math.min(MAP_SIZE - 1, Math.round(v)));
  return [clamp((x0 + x1) / 2), clamp((z0 + z1) / 2)];
}
