// I3 (C5F): the season's alerts for the left feed. Cold homes, firewood short for the winter, food
// days as winter opens, floods forecast, festival prep, a new species, commissions due, a raid on its
// way and wolves tonight. Threats are told plainly and kindly (P3, P36), and each lens hears what it
// can do about them: the Hearth lanterns, hedges and good cheer, the Ledger walls and the Watch.
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, TICKS_PER_DAY, type Lens } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import type { Alert } from './alerts';
import { BAND_WORD, SIDE_WORD, speciesName, today, whenWord } from './seasons';

/** Festival prep: nag from this many days out, if nothing is planned. */
const FESTIVAL_PREP_DAYS = 3;
/** A commission is due soon within this many days. */
const COMMISSION_DUE_DAYS = 2;

function both(a: Omit<Alert, 'lens'>, hearth?: Partial<Alert>): Alert[] {
  return [
    { ...a, lens: 'ledger' as Lens },
    { ...a, ...hearth, lens: 'hearth' as Lens },
  ];
}

export function seasonAlerts(m: Mirror): Alert[] {
  const out: Alert[] = [];
  if (m.settings.value.mode !== 'standard') return out;
  const now = m.tick.value;
  const day = today(now);
  const season = Math.floor((day % (DAYS_PER_SEASON * 4)) / DAYS_PER_SEASON);
  const dayOfSeason = (day % DAYS_PER_SEASON) + 1;
  const town = m.town.value;
  const households = town?.households ?? m.households.size;
  const stocks = m.stocks.value?.lines ?? [];
  const stock = (g: string) => stocks.find((l) => l.good === g)?.stock ?? 0;

  // Warmth
  const cold = town?.coldHouseholds ?? 0;
  if (cold > 0) {
    out.push(
      ...both(
        {
          key: `cold-${day}`,
          tone: 'warn',
          icon: 'home',
          text: `${cold} ${cold === 1 ? 'home is' : 'homes are'} cold tonight. Firewood, from a chopping shed or the market.`,
          action: { kind: 'panel', panel: 'reports', page: 'stocks' },
        },
        {
          text: `${cold} ${cold === 1 ? 'home is' : 'homes are'} cold tonight. A warm word and a lit lantern help, firewood more.`,
          tone: 'quiet',
        },
      ),
    );
  }
  if (households > 0 && (season === 2 || season === 3)) {
    const daysLeft = season === 3 ? DAYS_PER_SEASON - dayOfSeason + 1 : DAYS_PER_SEASON;
    const need = households * daysLeft;
    const have = stock('firewood');
    if (have < need) {
      out.push({
        key: `firewood-${season}-${Math.floor(have / 10)}`,
        lens: 'ledger',
        tone: season === 3 ? 'warn' : 'quiet',
        icon: 'good:firewood',
        text: `Firewood for the winter: ${have} in store, ${need} wanted for ${households} ${households === 1 ? 'home' : 'homes'}.`,
        action: { kind: 'panel', panel: 'reports', page: 'stocks' },
      });
    }
  }
  if (season === 3 && dayOfSeason <= 2 && (town?.population ?? 0) > 0) {
    let food = 0;
    for (const l of stocks) if (content.goodById.get(l.good)?.food) food += l.stock;
    const days = Math.floor(food / (town?.population ?? 1));
    out.push({
      key: `winter-food-${day}`,
      lens: 'ledger',
      tone: days < DAYS_PER_SEASON ? 'warn' : 'quiet',
      icon: 'snowflake',
      text:
        days >= DAYS_PER_SEASON
          ? `Winter is here and the larders hold ${days} days of food. Nothing grows till spring; that will do.`
          : `Winter is here with ${days} ${days === 1 ? 'day' : 'days'} of food in store, and nothing grows till spring.`,
      action: { kind: 'panel', panel: 'reports', page: 'stocks' },
    });
  }

  // Weather
  for (const e of m.weather.value?.events ?? []) {
    if (e.event !== 'flood' || e.active || e.start <= now) continue;
    out.push(
      ...both({
        key: `flood-${e.id}`,
        tone: 'warn',
        icon: 'coverage',
        text: `High water expected ${whenWord(today(e.start) - day)}. Low fields and the riverside may get their feet wet.`,
      }),
    );
  }

  // Festival prep
  const f = m.festival.value;
  if (f && !f.live && f.day >= day && f.day - day <= FESTIVAL_PREP_DAYS && !f.plan) {
    out.push({
      key: `festival-prep-${f.day}`,
      lens: 'hearth',
      tone: 'news',
      icon: 'festival',
      text: `The ${f.festival.name} is ${whenWord(f.day - day)} and nothing is planned. A site, a menu, some music?`,
      action: { kind: 'panel', panel: 'festival' },
    });
  }

  // Nature
  for (const g of m.fieldGuide.values()) {
    if (now - g.firstTick > TICKS_PER_DAY) continue;
    out.push({
      key: `species-${g.species}`,
      lens: 'hearth',
      tone: 'news',
      icon: 'fieldguide',
      text: `${speciesName(g.species, g.name)} seen for the first time. A new page in the Field Guide.`,
      action: { kind: 'panel', panel: 'field-guide', page: g.species },
    });
  }

  // Commissions
  for (const c of m.commissions.values()) {
    if (c.status === 'offered') {
      out.push({
        key: `commission-${c.id}`,
        lens: 'ledger',
        tone: 'news',
        icon: 'trade',
        text: `A commission: ${c.ask}. Take it on, or decline with thanks.`,
        action: { kind: 'panel', panel: 'trade', page: 'commissions' },
      });
    } else if (
      c.status === 'accepted' &&
      c.deadlineTick &&
      c.deadlineTick - now <= COMMISSION_DUE_DAYS * TICKS_PER_DAY
    ) {
      out.push({
        key: `commission-due-${c.id}`,
        lens: 'ledger',
        tone: 'warn',
        icon: 'trade',
        text: `${c.name} is due ${whenWord(today(c.deadlineTick) - day)}, ${c.progress}% done.`,
        action: { kind: 'panel', panel: 'trade', page: 'commissions' },
      });
    }
  }

  // Threats: plain facts, kind words, both lenses, each with what it can do.
  const t = m.threat.value;
  if (t?.band && t.side) {
    const when = whenWord(t.daysLeft ?? 0);
    out.push(
      ...both(
        {
          key: `raid-${t.band}-${t.side}-${t.daysLeft}`,
          tone: 'warn',
          icon: 'watch',
          text: `${BAND_WORD[t.band]} is headed our way from ${SIDE_WORD[t.side]}, ${when}. Walls, gates and the Watch's guard points will see them off.`,
          action: { kind: 'panel', panel: 'watch' },
        },
        {
          text: `Strangers are coming from ${SIDE_WORD[t.side]}, ${when}. Lanterns and hedges help, and a cheerful town keeps the Watch brave.`,
          icon: 'lantern',
          action: { kind: 'panel', panel: 'watch' },
        },
      ),
    );
  }
  if (t?.wolvesTonight && season === 3) {
    out.push(
      ...both(
        {
          key: `wolves-${day}`,
          tone: 'quiet',
          icon: 'lantern',
          text: 'Wolves about tonight. Fenced farms and walls keep them off; nobody is hurt, only startled.',
        },
        {
          text: 'Wolves about tonight. Lit lanterns keep them at the edge of things; folk may want to be home early.',
        },
      ),
    );
  }
  return out;
}
