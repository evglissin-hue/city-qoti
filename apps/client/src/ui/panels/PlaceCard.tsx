// R2D: the place card. What a spot is of an evening: seats and standing, who came and who is there,
// what it served and took, its draw in parts, and what it still wants. Also the rename field it
// shares with the street block. Panels read views through the Mirror, never the sim.
import { content } from '@qoti/content';
import {
  calendar,
  MAX_PLACE_NAME_CHARS,
  PENNIES_PER_COIN,
  type PlaceKind,
  type PlacePriority,
  type PlaceView,
  type RestKind,
  type SeatId,
  type StreetView,
} from '@qoti/sim';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { capital, goodName, placeName, seatLabel } from '../format';
import { rankAtLeast } from '../village';
import { Frame, Heading, Meter, Sparkline } from './parts';
import { setGroundLayer, tilePairs } from '../groundHighlight';
import { Thread } from './Thread';
import { Dial } from './villageParts';
import './place.css';

const KIND_WORD: Record<PlaceKind, string> = {
  sit: 'sit',
  eat: 'eat',
  view: 'view',
  play: 'play',
  meet: 'meet',
  walk: 'walk',
};

/** "sit, eat and view" for a place's kinds. */
export function kindsWords(kinds: readonly PlaceKind[]): string {
  const words = kinds.map((k) => KIND_WORD[k] ?? k);
  if (words.length === 0) return 'somewhere to be';
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const PART_LABEL: [keyof PlaceView['parts'], string][] = [
  ['charm', 'charm'],
  ['site', 'a pattern site'],
  ['pieces', 'pieces'],
  ['water', 'water'],
  ['lit', 'lanterns lit'],
  ['treats', 'treats'],
  ['winter', 'winter'],
];

/** The draw's nonzero parts, in order: [[38, "charm"], [4, "pieces"], [-20, "winter"]]. */
export function drawParts(p: Pick<PlaceView, 'parts'>): [number, string][] {
  const out: [number, string][] = [];
  for (const [key, label] of PART_LABEL) {
    const v = p.parts[key];
    if (v) out.push([v, label]);
  }
  return out;
}

/** "38 charm + 4 pieces + 5 lanterns lit - 20 winter = 27". The sum adds up to the draw. */
export function drawSum(p: Pick<PlaceView, 'parts' | 'draw'>): string {
  const parts = drawParts(p);
  if (parts.length === 0) return `Nothing to draw on yet: ${p.draw}`;
  const sum = parts
    .map(([v, label], i) => {
      if (i === 0) return `${v} ${label}`;
      return v < 0 ? `- ${-v} ${label}` : `+ ${v} ${label}`;
    })
    .join(' ');
  return `${sum} = ${p.draw}`;
}

/** Seats and standing in words, child seats noted. */
export function seatsWords(p: Pick<PlaceView, 'seats' | 'childSeats' | 'standing'>): string {
  const grown = p.seats - p.childSeats;
  const bits: string[] = [];
  if (p.seats === 0) bits.push('No seats');
  else if (p.childSeats > 0 && grown > 0)
    bits.push(`${p.seats} ${p.seats === 1 ? 'seat' : 'seats'}, ${p.childSeats} for children only`);
  else if (p.childSeats > 0) bits.push(`${p.seats} ${p.seats === 1 ? 'seat' : 'seats'}, all for children`);
  else bits.push(`${p.seats} ${p.seats === 1 ? 'seat' : 'seats'}`);
  bits.push(p.standing > 0 ? `room for ${p.standing} more on their feet` : 'no standing room');
  return bits.join(', ');
}

/** What the outlets took, in coins, "a few pennies" under one. Empty when nothing was sold. */
export function tookWords(pennies: number, sold: number): string {
  if (sold <= 0 && pennies <= 0) return '';
  const treats = `${sold} ${sold === 1 ? 'treat' : 'treats'}`;
  if (pennies <= 0) return `${treats} went out, no coin changed hands`;
  const c = Math.floor(pennies / PENNIES_PER_COIN);
  const money = c < 1 ? 'a few pennies' : `${c} ${c === 1 ? 'coin' : 'coins'}`;
  return `${treats} sold, ${money} taken`;
}

/** The household's seat for a porch, the shelter of a roof, the warmth of a fire. */
export function coverWords(p: Pick<PlaceView, 'sheltered' | 'warm'>): string {
  if (p.sheltered && p.warm) return 'Under a roof and warm';
  if (p.sheltered) return 'Under a roof';
  if (p.warm) return 'Open air, with a fire';
  return 'Open air';
}

// --- R3D: supplies, in words and one control -----------------------------------------------------

const PRIORITIES: { value: PlacePriority; label: string }[] = [
  { value: 'keep', label: 'Keep first' },
  { value: 'normal', label: 'As it comes' },
  { value: 'rest', label: 'Let it rest' },
];

const PRIORITY_TITLE =
  'When candles, firewood or cloth run short, places kept first are supplied before the rest, and a place let rest takes nothing.';

const UNCOUNTED = new Set(['bunting']);

/** "lantern" to "lanterns", "flower arch" to "flower arches". */
function pluralWord(name: string): string {
  if (UNCOUNTED.has(name)) return name;
  return /(s|x|ch|sh)$/.test(name) ? `${name}es` : `${name}s`;
}

/** The place's supplied pieces' defs by supply kind, from its members. */
function suppliedDefs(session: Session, p: Pick<PlaceView, 'members'>) {
  const out: { id: number; name: string; supply: NonNullable<ReturnType<typeof defSupply>> }[] = [];
  for (const id of p.members) {
    const d = session.mirror.decor.get(id);
    const supply = d ? defSupply(d.def) : undefined;
    if (d && supply)
      out.push({ id, name: (content.decorById.get(d.def)?.name ?? d.def).toLowerCase(), supply });
  }
  return out;
}

function defSupply(def: string) {
  return content.decorById.get(def)?.supply;
}

/** A good's unit as "a candle" for one, "2 candles" for more, "firewood" for none counted. */
function unitWords(good: string, qty: number): string {
  const label = goodName(good).toLowerCase();
  if (qty === 1) return label.endsWith('s') ? `a ${label.slice(0, -1)}` : label;
  return `${qty} ${label}`;
}

type Supplied = ReturnType<typeof suppliedDefs>;

/** The name of a group of pieces: their shared name, or a fallback when they differ. */
function groupName(names: string[], n: number, fallback: string): string {
  const one = new Set(names).size === 1 ? names[0]! : fallback;
  return n === 1 ? one : pluralWord(one);
}

/** What the place's supplied pieces take, in words: "Its 3 lamp posts take a candle a night." */
export function suppliesWords(p: Pick<PlaceView, 'supplies'>, supplied: Supplied): string {
  const out: string[] = [];
  for (const s of p.supplies ?? []) {
    const defs = supplied.filter((d) => d.supply.kind === s.kind && (d.supply.good ?? '') === (s.good ?? ''));
    const sample = defs[0]?.supply;
    const n = s.pieces;
    const name = groupName(
      defs.map((d) => d.name),
      n,
      s.kind === 'nightly' ? 'lantern' : 'piece',
    );
    const one = n === 1;
    const subject = one ? `Its ${name}` : `Its ${n} ${name}`;
    const takes = one ? 'takes' : 'take';
    switch (s.kind) {
      case 'nightly':
        out.push(`${subject} ${takes} ${unitWords(s.good ?? '', Math.max(1, s.wants))} a night.`);
        break;
      case 'evening':
        out.push(`${subject} ${takes} ${goodName(s.good ?? '').toLowerCase()} on an evening someone comes.`);
        break;
      case 'season':
        out.push(`${subject} ${takes} ${unitWords(s.good ?? '', s.wants)} a season.`);
        break;
      case 'outlet':
        out.push(
          `${subject} ${one ? 'is' : 'are'} served by a stall or shop within ${sample?.radius ?? 3} tiles.`,
        );
        break;
      case 'well':
        out.push(`${subject} ${one ? 'needs' : 'need'} a well within ${sample?.radius ?? 8} tiles.`);
        break;
    }
  }
  return out.join(' ');
}

const REST_WORD: Record<RestKind, string> = {
  unlit: 'unlit',
  cold: 'cold',
  bare: 'bare',
  faded: 'faded',
  dry: 'dry',
};

/** What rests tonight: "Resting tonight: 2 lanterns unlit, the brazier cold." Never alarmed. */
export function restingWords(session: Session, p: Pick<PlaceView, 'resting'>): string {
  const groups = new Map<string, { name: string; kind: RestKind; n: number }>();
  for (const r of p.resting ?? []) {
    const d = session.mirror.decor.get(r.id);
    const name = (content.decorById.get(d?.def ?? '')?.name ?? 'piece').toLowerCase();
    const key = `${name}|${r.kind}`;
    const g = groups.get(key) ?? { name, kind: r.kind, n: 0 };
    g.n++;
    groups.set(key, g);
  }
  if (groups.size === 0) {
    // R3X: before the 17:30 settling nothing has been decided yet (the card read "Everything is
    // supplied tonight." at 17:21, the morning after a dark night). Mornings count as tonight to come.
    const { hour, minute } = calendar(session.mirror.tick.value);
    const S = content.supplies;
    const settled = hour * 60 + minute >= S.settleHour * 60 + S.settleMinute || hour < S.outHour;
    const at = `${S.settleHour}:${String(S.settleMinute).padStart(2, '0')}`;
    return settled ? 'Everything is supplied tonight.' : `Tonight's supplies are settled at ${at}.`;
  }
  const bits = [...groups.values()].map((g) =>
    g.n === 1 ? `the ${g.name} ${REST_WORD[g.kind]}` : `${g.n} ${pluralWord(g.name)} ${REST_WORD[g.kind]}`,
  );
  return `Resting tonight: ${bits.join(', ')}.`;
}

/** The priority control and the supplies in words; nothing at all without a supplied piece. */
function PlaceSupplies({ session, p }: { session: Session; p: PlaceView }) {
  const m = session.mirror;
  void m.revision.value;
  if (!rankAtLeast(m.charter.value?.rank, content.supplies.fromRank)) return null;
  const supplied = suppliedDefs(session, p);
  if (supplied.length === 0) return null;
  const current = p.priority ?? 'normal';
  const draws = p.supplies?.length ? suppliesWords(p, supplied) : '';
  return (
    <section class="place-supplies-block" data-testid="place-supplies-block">
      <Heading>When supplies run short</Heading>
      <div title={PRIORITY_TITLE}>
        <Dial
          label="When supplies run short"
          testid="place-priority"
          value={current}
          options={PRIORITIES}
          onChange={(priority) => {
            if (priority !== current) session.submit({ t: 'place.setPriority', id: p.id, priority });
          }}
        />
      </div>
      {p.supplies && p.supplies.length > 0 && (
        <p class="supplies-words small muted" data-testid="place-supplies">
          {draws}
          <br />
          {restingWords(session, p)}
        </p>
      )}
    </section>
  );
}

/** A rename field: type, press Enter or Rename. An empty name restores the generated one. */
export function RenameField({
  value,
  generated,
  onSave,
  testid,
}: {
  value: string;
  generated: string;
  onSave: (name: string) => void;
  testid: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const save = () => {
    const name = text.replace(/\s+/g, ' ').trim();
    if (name === value) return;
    onSave(name === generated ? '' : name);
  };
  return (
    <form
      class="rename"
      data-testid={testid}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div class="rename-row">
        {/* A name wraps rather than hiding its end (the master's read: "the stall by the
            Featherstone cottag"); Enter still renames, as in a one-line field. */}
        <textarea
          value={text}
          rows={text.length > 26 ? 2 : 1}
          maxLength={MAX_PLACE_NAME_CHARS}
          placeholder={generated}
          aria-label="Name"
          data-testid={`${testid}-input`}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value.replace(/\n/g, ' '))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            save();
          }}
        />
        <button type="submit" class="small-button" data-testid={`${testid}-save`}>
          Rename
        </button>
      </div>
      <p class="muted small">Leave it empty and it goes back to "{generated}".</p>
    </form>
  );
}

function namedBy(session: Session, seat: SeatId | undefined): string | null {
  if (seat === undefined) return null;
  return `Named by ${seatLabel(session.mirror.seats.value, seat, session.seat)}.`;
}

/** A street's name with its rename field, and whether it is kept for strolling. */
export function StreetLines({
  session,
  street,
  evening,
}: {
  session: Session;
  street: StreetView;
  evening: boolean;
}) {
  const by = namedBy(session, street.renamedBy);
  return (
    <div class="street-lines" data-testid="street-lines">
      <p class="street-name">
        <b>{street.name}</b>
      </p>
      {by && <p class="muted small">{by}</p>}
      {evening && <p data-testid="street-evening">Kept for strolling from 17:00 to 21:00; carts go round.</p>}
      <RenameField
        key={street.id}
        testid="street-rename"
        value={street.name}
        generated={street.generated}
        onSave={(name) => session.submit({ t: 'road.rename', id: street.id, name })}
      />
    </div>
  );
}

// Tiles as [x, z] pairs for the highlight API: kept with the ground's layers, re-exported here.
export { tilePairs };

/** "Tonight" while the evening is under way, "last evening" otherwise. */
function evenLabel(tick: number): string {
  const h = calendar(tick).hour;
  return h >= 17 && h < 21 ? 'Tonight' : 'Last evening';
}

export function PlaceCard({
  session,
  id,
  remove,
}: {
  session: Session;
  id: string;
  /** A member piece's own Remove, kept reachable when the card opened from a click on the piece. */
  remove?: { label: string; run: () => void };
}) {
  const m = session.mirror;
  void m.placesRevision.value;
  void m.revision.value;
  const p = m.places.get(id);
  const tilesKey = p ? p.tiles.join(',') : '';
  // The place's tiles are drawn on the ground while the card is open.
  useEffect(() => {
    if (!tilesKey) return;
    setGroundLayer(session, 'inspector', {
      tiles: tilePairs(tilesKey.split(',').map(Number)),
      tone: 'hearth',
      outline: true,
    });
    return () => setGroundLayer(session, 'inspector', null);
  }, [tilesKey]);
  if (!p) return null;
  const close = () => (session.ui.selection.value = null);
  const last = <T,>(a: readonly T[], zero: T): T => (a.length ? a[a.length - 1]! : zero);
  const visitors = last(p.visitors, 0);
  const took = tookWords(last(p.takings, 0), last(p.sold, 0));
  const outlets = p.serves
    .map((sid) => m.buildings.get(sid))
    .filter((b): b is NonNullable<typeof b> => !!b)
    .map((b) => placeName(b));
  const when = evenLabel(m.tick.value);
  const by = namedBy(session, p.renamedBy);
  const porch = p.source === 'porch';
  const goes = p.kinds.length ? `A place to ${kindsWords(p.kinds)}` : 'A place';
  const sum = drawSum(p);
  const eatKind = p.kinds.includes('eat');

  return (
    <Frame
      id="place-card"
      class="inspector-panel place"
      kicker={goes}
      title={capital(p.name)}
      onClose={close}
    >
      {by && <p class="muted small">{by}</p>}
      {porch && (
        <p data-testid="place-porch" class="porch-line">
          The household's own. Nobody else sits here.
        </p>
      )}

      <dl class="facts" data-testid="place-facts">
        <div>
          <dt>Seats</dt>
          <dd>{seatsWords(p)}</dd>
        </div>
        <div>
          <dt>Shelter</dt>
          <dd>{coverWords(p)}</dd>
        </div>
        <div>
          <dt>{when}</dt>
          <dd data-testid="place-visitors">
            {visitors === 0 ? 'Nobody came' : `${visitors} ${visitors === 1 ? 'visitor' : 'visitors'}`}
            {p.present > 0 ? `, ${p.present} here now` : ''}
          </dd>
        </div>
        {!porch && (
          <div>
            <dt>Serves</dt>
            <dd data-testid="place-serves">
              {outlets.length
                ? outlets.join(', ')
                : eatKind
                  ? 'Nothing on the shelf right now'
                  : 'Nothing to sell here'}
            </dd>
          </div>
        )}
        {took && (
          <div>
            <dt>It took</dt>
            <dd data-testid="place-took">{took}</dd>
          </div>
        )}
      </dl>

      <Thread session={session} subject={{ kind: 'place', id: p.id }} routeWhen="hover" />

      <Heading>Its draw</Heading>
      <Meter value={p.draw / 100} note={`${p.draw} of 100`} tone="ochre" testid="place-draw" />
      <p class="draw-sum" data-testid="place-draw-sum">
        {sum}
      </p>

      {p.visitors.length >= 2 && (
        <div class="visitors-row" data-testid="place-spark">
          <Sparkline values={p.visitors} width={96} />
          <span class="muted small">Visitors, the last {p.visitors.length} evenings</span>
        </div>
      )}

      <PlaceSupplies session={session} p={p} />

      {p.wants.length > 0 && (
        <>
          <Heading>Still wants</Heading>
          <ul class="wants" data-testid="place-wants">
            {p.wants.map((w) => (
              <li key={w}>{capital(w)}.</li>
            ))}
          </ul>
        </>
      )}

      <Heading>Its name</Heading>
      <RenameField
        key={p.id}
        testid="place-rename"
        value={p.name}
        generated={p.generated}
        onSave={(name) => session.submit({ t: 'place.rename', id: p.id, name })}
      />

      {remove && (
        <button type="button" class="danger" data-testid="place-remove" onClick={remove.run}>
          {remove.label}
        </button>
      )}
    </Frame>
  );
}

/** The decor piece's name, lowercase, for "Remove this bench". */
export function pieceWord(def: string): string {
  return (content.decorById.get(def)?.name ?? def).toLowerCase();
}
