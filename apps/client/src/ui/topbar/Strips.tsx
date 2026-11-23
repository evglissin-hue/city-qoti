import type { GoodFamily } from '@qoti/content';
// The top bar's lens strips. The Ledger's reads the town's demand and balances; the Hearth's reads
// how folk are doing. Each reads only its own signals and draws what topbar/strip.ts works out.
import { DEMAND_KINDS, type MoodBand } from '@qoti/sim';
import type { Session } from '../../app/session';
import { GoodIcon } from '../goodIcons';
import { MOOD_WORD } from '../hamlet';
import { gapSpot } from '../gaps';
import { Glyph } from '../icons';
import { toggleBook } from '../panels';
import { FestivalChip, RenownChip } from '../SeasonChips';
import { zoneInk } from '../village';
import { FAMILY_ICON } from './families';
import { readHands } from '../hands';
import { readSites } from '../sites';
import {
  chipReading,
  DEMAND_BAR,
  demandTitle,
  eveningReading,
  folkReading,
  gapsReading,
  materialReadings,
  winterReading,
  type ChipReading,
} from './strip';

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
            <span class="demand-word" aria-hidden="true">
              {info.label}
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

/** Residents in town and the jobs standing open; opens the Townsfolk panel. */
function FolkChip({ session }: { session: Session }) {
  const m = session.mirror;
  void m.revision.value; // workplaces fill and empty as buildings change
  const hands = readHands(m);
  const households = m.town.value?.households ?? m.households.size;
  const r = folkReading(hands, households);
  return (
    <button
      type="button"
      class={`folk-chip ${hands.folk === 0 ? 'empty' : ''}`}
      data-testid="folk-chip"
      title={r.title}
      onClick={() => toggleBook(session, 'people')}
    >
      <Glyph id="people" />
      <span class="chip-stack">
        <span class="chip-top">
          <span class="chip-label">Folk</span>
        </span>
        <span class="chip-figures">
          <span class={`chip-amount ${hands.folk === 0 ? 'warm' : ''}`} data-testid="folk-amount">
            {r.amount}
          </span>
          {r.jobs && (
            <span class={`chip-second ${r.warm ? 'warm' : ''}`} data-testid="folk-jobs">
              {r.jobs}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function CoverBar({ r }: { r: Pick<ChipReading, 'fill' | 'reserveAt' | 'markAt'> }) {
  return (
    <span class="cover-bar" aria-hidden="true">
      <i style={{ width: `${Math.round(r.fill * 100)}%` }} />
      {r.reserveAt !== null && <u class="tick reserve" style={{ left: `${r.reserveAt * 100}%` }} />}
      {r.markAt !== null && <u class="tick mark" style={{ left: `${r.markAt * 100}%` }} />}
    </span>
  );
}

function BalanceChips({ session }: { session: Session }) {
  const m = session.mirror;
  const b = m.balances.value;
  if (!b) return null;
  const open = (family: GoodFamily) => {
    session.ui.balancesFamily.value = family;
    session.ui.panel.value = 'balances';
  };
  const winter = winterReading(b);
  void m.revision.value; // open sites come and go with the buildings
  const sites = readSites(m);
  const stocks = new Map((m.stocks.value?.lines ?? []).map((l) => [l.good, l.stock]));
  const chip = (line: (typeof b.lines)[number]) => {
    const r = chipReading(line);
    return (
      <button
        key={line.family}
        type="button"
        class={`balance-chip ${r.low ? 'low' : ''} ${r.easy ? 'easy' : ''}`}
        data-testid={`balance-${line.family}`}
        title={r.title}
        onClick={() => open(line.family)}
      >
        <GoodIcon good={FAMILY_ICON[line.family]} />
        {/* Name and flavor pips, then the amount in store with the days it covers, then the bar. */}
        <span class="chip-stack">
          <span class="chip-top">
            <span class="chip-label">{r.label}</span>
            <span class="flavor-pips" aria-hidden="true">
              {r.pips.map((on, i) => (
                <i key={i} class={on ? 'on' : ''} />
              ))}
            </span>
          </span>
          <span class="chip-figures">
            <span class={`chip-amount ${r.empty ? 'warm' : ''}`}>{r.amount}</span>
            {r.cover && <span class={`chip-second cover-days ${r.coverWarm ? 'warm' : ''}`}>{r.cover}</span>}
          </span>
          <CoverBar r={r} />
        </span>
      </button>
    );
  };
  return (
    <div class="balance-chips" role="group" aria-label="What is in store">
      {b.lines.flatMap((line) => {
        if (line.family !== 'materials') return [chip(line)];
        return materialReadings({
          line,
          sites,
          stockOf: (good) => stocks.get(good),
          rank: m.town.value?.rank,
        }).map((r) => (
          <button
            key={r.good}
            type="button"
            class={`balance-chip material ${r.warm ? 'low' : ''} ${r.easy ? 'easy' : ''}`}
            data-testid={`material-${r.good}`}
            title={r.title}
            onClick={() => open('materials')}
          >
            <GoodIcon good={r.good} />
            <span class="chip-stack">
              <span class="chip-top">
                <span class="chip-label">{r.label}</span>
              </span>
              <span class="chip-figures">
                <span class={`chip-amount ${r.warm ? 'warm' : ''}`}>{r.of ?? r.amount}</span>
              </span>
              <CoverBar r={{ fill: r.fill, reserveAt: null, markAt: null }} />
            </span>
          </button>
        ));
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

/** The Ledger's strip: folk, what is in store, and what the town wants grown. */
export function LedgerStrip({ session }: { session: Session }) {
  return (
    <div class="lens-strip ledger-strip" data-testid="ledger-strip">
      <FolkChip session={session} />
      <BalanceChips session={session} />
      <DemandBars session={session} />
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
  const evening = eveningReading(m.town.value?.evenings);
  const gaps = m.gaps.value?.open;
  const gapsRead = gapsReading(gaps);
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
        class={`strip-chip ${wishes > 0 ? '' : 'easy'}`}
        data-testid="hearth-wishes"
        title="Wishes folk have voiced and are waiting on. Click to read them."
        onClick={() => toggleBook(session, 'wishes')}
      >
        <Glyph id="wishes" />
        {wishes > 0 ? (
          <>
            <span>{wishes}</span>
            <span class="strip-word">{wishes === 1 ? 'wish' : 'wishes'}</span>
          </>
        ) : (
          <span class="strip-word">no wishes waiting</span>
        )}
      </button>
      {evening && (
        <button
          type="button"
          class="strip-chip evening-chip"
          data-testid="hearth-evenings"
          title={evening.title}
          onClick={() => toggleBook(session, 'chronicle')}
        >
          <Glyph id="lantern" />
          <span>{evening.out}</span>
          <span class="strip-word">{evening.word}</span>
          <CoverBar r={{ fill: evening.fill, reserveAt: null, markAt: null }} />
        </button>
      )}
      {gapsRead && gaps && (
        <button
          type="button"
          class="strip-chip gaps-chip"
          data-testid="hearth-gaps"
          title={gapsRead.title}
          onClick={() => {
            const { x, z } = gapSpot(gaps[0]!);
            session.render?.focus(x, z);
          }}
        >
          <Glyph id="note" />
          <span>{gapsRead.label}</span>
        </button>
      )}
      <span class="strip-end">
        <FestivalChip session={session} />
        <RenownChip session={session} />
      </span>
    </div>
  );
}
