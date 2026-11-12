import { content, type GoodFamily } from '@qoti/content';
import { signal } from '@preact/signals';
import type { Session } from '../../app/session';
import { goodName } from '../format';
import { GoodIcon } from '../goodIcons';
import { Glyph } from '../icons';
import { goodPurpose } from '../purpose';
import { FAMILY_WORD } from '../village';

const KEY = 'qoti.stores.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the Stores panel is folded away; remembered per browser, never needed to play. */
export const storesCollapsed = signal(readCollapsed());

export function setStoresCollapsed(on: boolean): void {
  storesCollapsed.value = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage is optional; the panel still folds for this visit.
  }
}

/** Opens the panel from elsewhere (the strip's "+N more"); a book in the way is put down first. */
export function revealStores(session: Session): void {
  setStoresCollapsed(false);
  const open = session.ui.panel.value;
  if (open && open !== 'stores') session.ui.panel.value = null;
}

/** R1.0 stand-in: the five families, in GOOD_FAMILIES order (R1C's Balances book does the rest). */
const GROUPS: { id: GoodFamily; title: string }[] = (
  ['food', 'fuel', 'materials', 'wares', 'treats'] as const
).map((id) => ({ id, title: FAMILY_WORD[id] }));

/** The family a good's row sits under. */
export function groupOf(good: string): GoodFamily {
  return content.goodById.get(good)?.family ?? 'wares';
}

/**
 * P1 (player's chair): true while the Stores panel is on screen (the Ledger lens, unfolded, no book
 * over the left column), when the goods strip under the top bar would only repeat it.
 */
export function storesShowing(session: Session, bookOpen: boolean): boolean {
  return (
    !bookOpen &&
    !storesCollapsed.value &&
    session.ui.lens.value === 'ledger' &&
    session.mirror.settings.value.mode === 'standard' &&
    !!session.mirror.stocks.value
  );
}

/** Days of food in store for the town, as the Ledger's alert counts them (alerts.ts). */
export function foodCover(food: number, population: number): number | null {
  return population > 0 ? food / population : null;
}

function coverWords(days: number | null): string | null {
  if (days === null) return null;
  if (days < 1) return 'under a day';
  const d = Math.floor(days);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

/**
 * Playtest round seven ("ledger resource counts: bigger, maybe a side panel"): every good the town
 * holds or made today, grouped, with its icon, its count and today's making and using. Click a row
 * for the full stocks report.
 */
export function StoresPanel({ session }: { session: Session }) {
  const m = session.mirror;
  const lines = m.stocks.value?.lines;
  if (!lines || m.settings.value.mode !== 'standard' || session.ui.lens.value !== 'ledger') return null;
  const collapsed = storesCollapsed.value;
  const order = new Map(content.goods.map((g, i) => [g.id, i]));
  const sorted = [...lines].sort((a, b) => (order.get(a.good) ?? 99) - (order.get(b.good) ?? 99));
  const held = sorted.filter((l) => l.stock > 0 || l.producedToday > 0 || l.consumedToday > 0);
  let food = 0;
  for (const l of lines) if (groupOf(l.good) === 'food') food += l.stock;
  const cover = coverWords(foodCover(food, m.town.value?.population ?? m.residents.size));
  const open = () => {
    session.ui.balancesTab.value = 'families';
    session.ui.panel.value = 'balances';
  };
  return (
    <section class="panel stores" data-testid="stores">
      <header>
        <Glyph id="stores" />
        <h3>Stores</h3>
        <button
          type="button"
          class="close"
          data-testid="stores-fold"
          title={collapsed ? 'Unfold' : 'Fold away'}
          aria-expanded={!collapsed}
          onClick={() => setStoresCollapsed(!collapsed)}
        >
          {collapsed ? '+' : '−'}
        </button>
      </header>
      {!collapsed && (
        <div class="stores-body">
          {held.length === 0 && <p class="muted small">The storehouse is bare. It will get over it.</p>}
          {GROUPS.map((g) => {
            const rows = held.filter((l) => groupOf(l.good) === g.id);
            if (!rows.length) return null;
            return (
              <div key={g.id} class="stores-group" data-testid={`stores-${g.id}`}>
                <h4>
                  {g.title}
                  {g.id === 'food' && cover && <span class="cover">about {cover} of cover</span>}
                </h4>
                <ul>
                  {rows.map((l) => (
                    <li key={l.good}>
                      <button
                        type="button"
                        class={`stores-row ${l.stock <= 0 ? 'empty' : ''}`}
                        data-testid={`stores-${l.good}`}
                        title={`${goodPurpose(l.good)} Click for the stocks.`}
                        onClick={open}
                      >
                        <GoodIcon good={l.good} />
                        <span class="stores-name">{goodName(l.good)}</span>
                        <b class="stores-count">{l.stock}</b>
                        <span
                          class="stores-flow"
                          title={`${l.producedToday} made, ${l.consumedToday} used today`}
                        >
                          <span class={l.producedToday ? 'plus' : 'idle'}>+{l.producedToday}</span>
                          <span class={l.consumedToday ? 'minus' : 'idle'}>-{l.consumedToday}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
