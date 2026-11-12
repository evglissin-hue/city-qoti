import type { GoodFamily } from '@qoti/content';
// The top bar's lens strips. The Ledger's reads the town's demand and balances; the Hearth's reads
// how folk are doing. Each reads only its own signals and draws what topbar/strip.ts works out.
import { DEMAND_KINDS, type MoodBand } from '@qoti/sim';
import type { Session } from '../../app/session';
import { GoodIcon } from '../goodIcons';
import { MOOD_WORD } from '../hamlet';
import { Glyph } from '../icons';
import { toggleBook } from '../panels';
import { FestivalChip, RenownChip } from '../SeasonChips';
import { zoneInk } from '../village';
import { FAMILY_ICON } from './families';
import { chipReading, DEMAND_BAR, demandTitle, winterReading } from './strip';

function DemandBars({ session }: { session: Session }) {
  const demand = session.mirror.demand.value;
  if (!demand) return null;
  return (
    <div class="demand-bars" role="group" aria-label="What the town wants grown">
      {DEMAND_KINDS.map((kind, i) => {
        const bar = demand.bars[i];
        if (!bar) return null;
        const info = DEMAND_BAR[kind];
        return (
          <button
            key={kind}
            type="button"
            class={`demand-bar ${bar.lit ? 'lit' : 'quiet'}`}
            style={{ '--zone-ink': zoneInk(info.zone) }}
            data-testid={`demand-${kind}`}
            title={demandTitle(kind, bar)}
            aria-label={demandTitle(kind, bar).split('\n')[0]}
            onClick={() => session.tools?.select('zone', info.zone)}
          >
            <span class="demand-well">
              <i style={{ height: `${Math.max(6, Math.min(100, bar.value))}%` }} />
              {bar.lit && <b class="demand-dot" aria-hidden="true" />}
            </span>
            <span class="demand-letter" aria-hidden="true">
              {info.letter}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BalanceChips({ session }: { session: Session }) {
  const b = session.mirror.balances.value;
  if (!b) return null;
  const open = (family: GoodFamily) => {
    session.ui.balancesFamily.value = family;
    session.ui.panel.value = 'balances';
  };
  const winter = winterReading(b);
  return (
    <div class="balance-chips" role="group" aria-label="Days of cover by family">
      {b.lines.map((line) => {
        const r = chipReading(line);
        return (
          <button
            key={line.family}
            type="button"
            class={`balance-chip ${r.low ? 'low' : ''}`}
            data-testid={`balance-${line.family}`}
            title={r.title}
            onClick={() => open(line.family)}
          >
            <GoodIcon good={FAMILY_ICON[line.family]} />
            {/* The bar of cover, with the flavors on offer as pips under it. */}
            <span class="chip-stack">
              <span class="cover-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(r.fill * 100)}%` }} />
                {r.reserveAt !== null && <u class="tick reserve" style={{ left: `${r.reserveAt * 100}%` }} />}
                {r.markAt !== null && <u class="tick mark" style={{ left: `${r.markAt * 100}%` }} />}
              </span>
              <span class="flavor-pips" aria-hidden="true">
                {r.pips.map((on, i) => (
                  <i key={i} class={on ? 'on' : ''} />
                ))}
              </span>
            </span>
            <span class="cover-days">{r.days}</span>
          </button>
        );
      })}
      {winter && (
        <button
          type="button"
          class="winter-reserve"
          data-testid="winter-reserve"
          title={winter.title}
          onClick={() => (session.ui.panel.value = 'balances')}
        >
          <Glyph id="snowflake" />
          <span class="cover-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(winter.fill * 100)}%` }} />
          </span>
        </button>
      )}
    </div>
  );
}

/** The Ledger's strip: what the town wants grown, and how each family of goods stands. */
export function LedgerStrip({ session }: { session: Session }) {
  return (
    <div class="lens-strip ledger-strip" data-testid="ledger-strip">
      <DemandBars session={session} />
      <BalanceChips session={session} />
    </div>
  );
}

/** The Hearth's strip: how folk feel, wishes waiting, the festival and renown. */
export function HearthStrip({ session }: { session: Session }) {
  const m = session.mirror;
  void m.hamletRevision.value;
  let mood = 0;
  let folk = 0;
  for (const r of m.residents.values()) {
    mood += r.moodBand;
    folk++;
  }
  const band = folk ? Math.round(mood / folk) : 2;
  const wishes = m.wishes.size;
  return (
    <div class="lens-strip hearth-strip" data-testid="hearth-strip">
      <button
        type="button"
        class="strip-chip"
        data-testid="hearth-mood"
        title={
          folk
            ? `On the whole, the valley feels ${MOOD_WORD[band as MoodBand].toLowerCase()}. Click for the townsfolk.`
            : 'Nobody has moved in yet: families walk in from the valley gate. Click for the townsfolk.'
        }
        onClick={() => toggleBook(session, 'people')}
      >
        <span class={`mood-dot band-${band}`} aria-hidden="true" />
        <span>{folk ? MOOD_WORD[band as MoodBand] : 'Nobody yet'}</span>
      </button>
      <button
        type="button"
        class="strip-chip"
        data-testid="hearth-wishes"
        title="Wishes folk have voiced and are waiting on. Click to read them."
        onClick={() => toggleBook(session, 'wishes')}
      >
        <Glyph id="wishes" />
        <span>{wishes}</span>
        <span class="strip-word">{wishes === 1 ? 'wish' : 'wishes'}</span>
      </button>
      <FestivalChip session={session} />
      <RenownChip session={session} />
    </div>
  );
}
