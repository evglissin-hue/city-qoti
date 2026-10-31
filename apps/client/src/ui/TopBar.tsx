import { content } from '@qoti/content';
import { calendar, SEASON_NAMES, type MoodBand, type Speed } from '@qoti/sim';
import type { Session } from '../app/session';
import { copy } from './copy';
import { coinCount, coins, formatDate, formatTime, speedNote } from './format';
import { GoodIcon } from './goodIcons';
import { MOOD_WORD } from './hamlet';
import { Glyph } from './icons';
import { goodPurpose } from './purpose';
import { toggleBook } from './panels';
import { GoToPartner } from './Presence';
import { RANK_WORD } from './village';

const SPEEDS: { speed: Speed; label: string; title: string }[] = [
  { speed: 0, label: '❚❚', title: 'Pause (Space)' },
  { speed: 1, label: '1×', title: 'Normal speed (1)' },
  { speed: 2, label: '2×', title: 'Double speed (2)' },
  { speed: 3, label: '3×', title: 'Triple speed (3)' },
];

const STATUS_TEXT = {
  connecting: 'Connecting',
  'catching-up': 'Catching up',
  live: 'Live',
  offline: 'Offline',
} as const;

export function TopBar({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const m = session.mirror;
  const tick = m.tick.value;
  const speed = m.clock.value.speed;
  const seats = m.seats.value;
  const settings = m.settings.value;
  const mine = session.myDesiredSpeed();
  const note = speedNote(seats, speed, session.seat, settings.togetherOnly);
  const status = session.connection?.status.value ?? 'connecting';
  const online = session.target.mode === 'online';

  return (
    <header class="topbar panel">
      <div class="topbar-town">
        <strong>{settings.townName}</strong>
        <span class="muted">{settings.valleyName}</span>
      </div>
      {settings.mode === 'standard' && <TownStats session={session} />}
      <div class="topbar-clock" data-testid="clock">
        <span>{formatDate(tick)}</span>
        <span class="clock-time">{formatTime(tick)}</span>
        <span class="season-chip" data-testid="season">
          {SEASON_NAMES[calendar(tick).season]}
        </span>
      </div>
      <div class="topbar-speed">
        {SPEEDS.map((s) => (
          <button
            key={s.speed}
            type="button"
            class={`speed ${speed === s.speed ? 'effective' : ''} ${mine === s.speed ? 'mine' : ''}`}
            title={s.title}
            data-testid={`speed-${s.speed}`}
            onClick={() => session.setSpeed(s.speed)}
          >
            {s.label}
          </button>
        ))}
        {note && (
          <span class="speed-note" data-testid="speed-note" title={note}>
            {note}
          </span>
        )}
      </div>
      <div class="topbar-right">
        <span class="seats">
          {seats.map((s) => (
            <span
              key={s.seat}
              class={`seat ${s.connected ? 'on' : 'off'}`}
              title={s.connected ? 'Here' : 'Away'}
            >
              <i style={{ background: `#${s.color.toString(16).padStart(6, '0')}` }} />
              {s.seat === session.seat ? `${s.name} (you)` : s.name}
            </span>
          ))}
        </span>
        {online && <GoToPartner session={session} />}
        <span class={`chip status-${status}`} data-testid="connection">
          {online ? STATUS_TEXT[status] : 'Solo'}
        </span>
        {online && (
          <button
            type="button"
            class="ghost-button"
            data-testid="invite-open"
            onClick={() => (session.ui.inviteOpen.value = true)}
          >
            Invite
          </button>
        )}
        <button
          type="button"
          class="ghost-button"
          data-testid="settings-open"
          title={copy.settings.open}
          onClick={() => (session.ui.settingsOpen.value = true)}
        >
          {copy.settings.open}
        </button>
        <button type="button" class="ghost-button" onClick={onLeave} title="Back to the title screen">
          Leave
        </button>
      </div>
    </header>
  );
}

/** Always on show (playtest round five): what building takes, whether or not any is in. */
const ALWAYS = ['logs', 'planks', 'stone'] as const;
const MAX_CHIPS = 9;

/**
 * How long a strip of n chips runs with its words (about 5rem a chip), so the lane under the top
 * bar drops the words only when they would not fit (see the strip's container queries).
 */
function fitClass(n: number): string {
  return n <= 5 ? 'fit-s' : n <= 8 ? 'fit-m' : 'fit-l';
}

/**
 * Playtest round five ("it should be clear how many resources you have"): the town's stock of the
 * building goods and whatever else it holds or makes, under the top bar in both lenses. Food is one
 * chip. Each chip says where the good comes from and goes; a click opens the stocks report.
 */
export function StockStrip({ session }: { session: Session }) {
  const m = session.mirror;
  const lines = m.stocks.value?.lines;
  if (!lines || m.settings.value.mode !== 'standard') return null;
  // Playtest round six: the Ledger watches the stocks; the Hearth watches how folk are doing.
  if (session.ui.lens.value === 'hearth') return <HearthStrip session={session} />;
  let food = 0;
  const foodNames: string[] = [];
  const chips: { good: string; n: number; made: number; used: number }[] = [];
  for (const l of lines) {
    const def = content.goodById.get(l.good);
    if (def?.food) {
      food += l.stock;
      if (l.stock > 0) foodNames.push(`${l.stock} ${def.label}`);
      continue;
    }
    const always = (ALWAYS as readonly string[]).includes(l.good);
    if (!always && l.stock <= 0 && l.producedToday <= 0 && l.producedYesterday <= 0) continue;
    chips.push({ good: l.good, n: l.stock, made: l.producedToday, used: l.consumedToday });
  }
  chips.sort(
    (a, b) =>
      Number((ALWAYS as readonly string[]).includes(b.good)) -
      Number((ALWAYS as readonly string[]).includes(a.good)),
  );
  const open = () => {
    session.ui.reportTab.value = 'stocks';
    session.ui.panel.value = session.ui.panel.value === 'reports' ? null : 'reports';
  };
  const shown = chips.slice(0, MAX_CHIPS);
  return (
    <div class={`stock-strip panel ${fitClass(1 + shown.length)}`} data-testid="stock-strip">
      <button
        type="button"
        class="stock-chip"
        data-testid="stock-food"
        title={`Food in store${foodNames.length ? `: ${foodNames.join(', ')}` : ': none yet'}. Click for the stocks.`}
        onClick={open}
      >
        <GoodIcon good="bread" />
        <span>{food}</span>
        <span class="stock-word">food</span>
      </button>
      {shown.map((c) => (
        <button
          key={c.good}
          type="button"
          class={`stock-chip ${c.n <= 0 ? 'empty' : ''}`}
          data-testid={`stock-${c.good}`}
          title={`${goodPurpose(c.good)} ${c.n} in store; ${c.made} made and ${c.used} used today. Click for the stocks.`}
          onClick={open}
        >
          <GoodIcon good={c.good} />
          <span>{c.n}</span>
          <span class="stock-word">{content.goodById.get(c.good)?.label ?? c.good}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Playtest round six: the Hearth's strip under the top bar: how folk feel, the Pattern Book pages
 * found, wishes waiting and plaques won. Each chip opens its book.
 */
function HearthStrip({ session }: { session: Session }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  let mood = 0;
  let folk = 0;
  for (const r of m.residents.values()) {
    mood += r.moodBand;
    folk++;
  }
  const band = folk ? Math.round(mood / folk) : 2;
  const patterns = [...m.patterns.values()];
  const found = patterns.filter((p) => p.discovered).length;
  const wishes = m.wishes.size;
  const plaques = [...m.achievements.values()].filter((a) => a.unlocked).length;
  const open = (id: string) => toggleBook(session, id);
  return (
    <div class={`stock-strip hearth-strip panel ${fitClass(4)}`} data-testid="hearth-strip">
      <button
        type="button"
        class="stock-chip"
        data-testid="hearth-mood"
        title={
          folk
            ? `On the whole, the valley feels ${MOOD_WORD[band as MoodBand].toLowerCase()}. Click for the townsfolk.`
            : 'Nobody has moved in yet: families walk in from the valley gate. Click for the townsfolk.'
        }
        onClick={() => open('people')}
      >
        <span class={`mood-dot band-${band}`} aria-hidden="true" />
        <span>{folk ? MOOD_WORD[band as MoodBand] : 'Nobody yet'}</span>
      </button>
      <button
        type="button"
        class="stock-chip"
        data-testid="hearth-patterns"
        title="Pages of the Pattern Book found: charming corners that unlock new pieces. Click for the book."
        onClick={() => open('patterns')}
      >
        <Glyph id="patterns" />
        <span>{found}</span>
        <span class="stock-word">patterns</span>
      </button>
      <button
        type="button"
        class="stock-chip"
        data-testid="hearth-wishes"
        title="Wishes folk have voiced and are waiting on. Click to read them."
        onClick={() => open('wishes')}
      >
        <Glyph id="wishes" />
        <span>{wishes}</span>
        <span class="stock-word">{wishes === 1 ? 'wish' : 'wishes'}</span>
      </button>
      <button
        type="button"
        class="stock-chip"
        data-testid="hearth-plaques"
        title="Brass plaques the valley has earned. Click for the wall of them."
        onClick={() => open('achievements')}
      >
        <Glyph id="achievements" />
        <span>{plaques}</span>
        <span class="stock-word">{plaques === 1 ? 'plaque' : 'plaques'}</span>
      </button>
    </div>
  );
}

/** Treasury and population, standard valleys only. Lean times show gently, never as an alarm. */
function TownStats({ session }: { session: Session }) {
  const m = session.mirror;
  const town = m.town.value;
  const budget = m.budget.value;
  const treasury = budget?.treasury ?? town?.treasury ?? 0;
  const lean = budget?.leanTimes ?? town?.leanTimes ?? false;
  const people = town?.population ?? m.residents.size;
  const homes = town?.households ?? m.households.size;
  const openBudget = () => {
    session.ui.lens.value = 'ledger';
    session.ui.reportTab.value = 'budget';
    session.ui.panel.value = 'reports';
  };
  return (
    <div class="topbar-town-stats">
      <button
        type="button"
        class={`stat-chip coins ${lean ? 'lean' : ''}`}
        data-testid="treasury"
        title={
          lean
            ? `${coins(treasury)}. Lean times: new building waits until the books are back above zero.`
            : `${coins(treasury)} in the treasury. Click for the budget.`
        }
        onClick={openBudget}
      >
        <Glyph id="coin" />
        {coinCount(treasury)}
        {lean && <span class="lean-word">lean times</span>}
      </button>
      <RankChip session={session} />
      <button
        type="button"
        class={`stat-chip people ${session.ui.panel.value === 'people' ? 'open' : ''}`}
        data-testid="population"
        title={`${people} ${people === 1 ? 'resident' : 'residents'} in ${homes} ${homes === 1 ? 'household' : 'households'}. Click for the townsfolk (K).`}
        onClick={() => toggleBook(session, 'people')}
      >
        <Glyph id="people" />
        {people}
      </button>
    </div>
  );
}

/**
 * I2 (C4F): the town's rank and how far along the next Charter is, as a little pennant with a pip
 * per goal. Opens the Charter board; glows warmly when the claim is open.
 */
function RankChip({ session }: { session: Session }) {
  const m = session.mirror;
  const town = m.town.value;
  const c = m.charter.value;
  const rank = c?.rank ?? town?.rank;
  if (!rank) return null;
  const goals = c?.goals ?? [];
  const done = c ? goals.filter((g) => g.done).length : (town?.charter?.done ?? 0);
  const total = c ? goals.length : (town?.charter?.total ?? 0);
  const ready = c?.ready ?? town?.charter?.ready ?? false;
  const next = c?.next;
  const open = session.ui.panel.value === 'charter';
  return (
    <button
      type="button"
      class={`stat-chip rank ${ready ? 'ready' : ''} ${open ? 'open' : ''}`}
      data-testid="rank"
      title={
        next
          ? `${RANK_WORD[rank]}. ${done} of ${total} goals toward ${RANK_WORD[next]}${ready ? ': ready to claim!' : '.'} (H)`
          : `${RANK_WORD[rank]}. The Charter board (H)`
      }
      onClick={() => (session.ui.panel.value = open ? null : 'charter')}
    >
      <Glyph id="rank" />
      <span class="rank-word">{RANK_WORD[rank]}</span>
      {next && total > 0 && (
        <span class="pips" aria-label={`${done} of ${total}`}>
          {goals.length
            ? goals.map((g) => <i key={g.id} class={`${g.done ? 'on' : ''} lane-${g.lane}`} />)
            : Array.from({ length: total }, (_, i) => <i key={i} class={i < done ? 'on' : ''} />)}
        </span>
      )}
    </button>
  );
}
