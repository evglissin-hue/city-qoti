// R1C: the Businesses book. Every business and specialized building, grouped by what it is, with its
// trade, its keeper's family, its level, its hands, how it is doing in words, and the pin that keeps
// it a bakery. It replaces the Reports book's workforce and building tabs.
import { content } from '@qoti/content';
import type { BusinessView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { buildingName, coinCount } from '../format';
import { Glyph } from '../icons';
import './businesses.css';
import { Empty, Frame } from './parts';

type Group = 'crafts' | 'farms' | 'shops' | 'specialized';

const GROUPS: [Group, string][] = [
  ['crafts', 'Workshops'],
  ['farms', 'Farmland'],
  ['shops', 'Shops'],
  ['specialized', 'Specialized'],
];

/** The name a business goes by: its trade ("Baker"), or its building when specialized. */
export function businessName(b: Pick<BusinessView, 'def' | 'trade'>): string {
  return (b.trade && content.tradeById.get(b.trade)?.name) || buildingName(b.def);
}

function groupOf(b: BusinessView): Group {
  if (!b.trade) return 'specialized';
  const zone = content.tradeById.get(b.trade)?.zone;
  return zone === 'farms' || zone === 'shops' ? zone : 'crafts';
}

/** The keeper's family name, or null while it has no keeper. */
export function keeperFamily(session: Session, b: Pick<BusinessView, 'keeperId'>): string | null {
  if (!b.keeperId) return null;
  return session.mirror.residents.get(b.keeperId)?.family ?? null;
}

/** "Kept by the Hollin family." */
export function keeperLine(family: string | null): string {
  return family ? `Kept by the ${family} family` : 'No keeper yet';
}

/** Level as three pips. */
export function LevelPips({ level }: { level: number }) {
  return (
    <span class="level-pips" role="img" aria-label={`Level ${level} of 3`} title={`Level ${level} of 3`}>
      {[1, 2, 3].map((n) => (
        <i key={n} class={n <= level ? 'on' : ''} />
      ))}
    </span>
  );
}

export function handsText(b: Pick<BusinessView, 'hands' | 'crew'>): string {
  return `${b.hands} of ${b.crew} ${b.crew === 1 ? 'hand' : 'hands'}`;
}

/**
 * "Takes 12, pays 7 a work day": a business's takings and outgoings in whole coins (the inspector
 * has the exact keep), or null while it has none. R1X: whole coins, so a row never reads "110.34"
 * beside "20".
 */
export function profitLine(b: Pick<BusinessView, 'profit'>): string | null {
  if (!b.profit || (b.profit.takes === 0 && b.profit.pays === 0)) return null;
  return `Takes ${coinCount(b.profit.takes)}, pays ${coinCount(b.profit.pays)} a work day`;
}

/** Statuses that are not good news, for the inspector's warning ink. */
export function statusIsTrouble(status: string): boolean {
  return /^(Resting|Waiting|Paused)/.test(status);
}

/** The pin's words, as a tooltip. */
export function pinTitle(b: Pick<BusinessView, 'pinned' | 'trade'>): string {
  const name = (b.trade && content.tradeById.get(b.trade)?.name.toLowerCase()) || 'trade';
  return b.pinned ? 'Let it change trade' : `Keep it a ${name}`;
}

/** Pins a business to its trade, or lets it change again. */
export function togglePin(session: Session, b: Pick<BusinessView, 'id' | 'pinned' | 'trade'>): void {
  if (!b.trade) return;
  session.submit({ t: 'build.pinRecipe', id: b.id, trade: b.pinned ? null : b.trade });
}

/** A button that pins or unpins a business. */
export function PinButton({ session, b }: { session: Session; b: BusinessView }) {
  if (!b.trade) return null;
  return (
    <button
      type="button"
      class={`pin ${b.pinned ? 'on' : ''}`}
      aria-pressed={b.pinned}
      title={pinTitle(b)}
      data-testid={`pin-${b.id}`}
      onClick={() => togglePin(session, b)}
    >
      <Glyph id="lock" />
    </button>
  );
}

function select(session: Session, id: number): void {
  const b = session.mirror.buildings.get(id);
  session.ui.selection.value = { kind: 'building', id };
  if (b) session.render?.focus(b.x, b.z);
}

function Row({ session, b }: { session: Session; b: BusinessView }) {
  const family = keeperFamily(session, b);
  return (
    <li class="business-row" data-testid={`business-${b.id}`}>
      <button type="button" class="business-main" onClick={() => select(session, b.id)}>
        <span class="business-name">
          <strong>{businessName(b)}</strong>
          {/* Specialized buildings never level up, so only businesses show the pips. */}
          {b.trade && <LevelPips level={b.level} />}
        </span>
        <span class="muted small">
          {b.trade ? `${keeperLine(family)}. ` : ''}
          {b.served ? `Serves ${b.served.count} of ${b.served.capacity}. ` : ''}
          {b.crew > 0 ? `${handsText(b)}.` : ''}
        </span>
        <span class="business-status small">{b.status}</span>
        {profitLine(b) && (
          <span class="business-profit muted small" data-testid={`business-profit-${b.id}`}>
            {profitLine(b)}
          </span>
        )}
      </button>
      <PinButton session={session} b={b} />
    </li>
  );
}

/** The Ledger's businesses: workshops, farmland, shops and the specialized buildings that serve them. */
export function BusinessesPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.villageRevision.value;
  const rows = [...m.businesses.values()].sort((a, b) => a.id - b.id);
  const close = () => (session.ui.panel.value = null);
  return (
    <Frame
      id="businesses"
      class="book-panel businesses"
      icon="building"
      kicker="The Ledger"
      title="Businesses"
      onClose={close}
    >
      {rows.length === 0 ? (
        <Empty>Nothing has grown yet. Zone some Workshops or Farmland and the town will set up shop.</Empty>
      ) : (
        GROUPS.map(([id, label]) => {
          const list = rows.filter((b) => groupOf(b) === id);
          if (!list.length) return null;
          return (
            <section key={id} class="business-group" data-testid={`businesses-${id}`}>
              <h4 class="flourish">
                {label} <span class="muted small">{list.length}</span>
              </h4>
              <ul class="business-list">
                {list.map((b) => (
                  <Row key={b.id} session={session} b={b} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </Frame>
  );
}
