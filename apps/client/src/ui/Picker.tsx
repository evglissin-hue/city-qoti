// The Ledger's Build picker (docs/spec/17-presentation.md, The Build picker): three shelves. Zones
// holds the brushes beside their demand bars, Specialized the buildings tied to the ground by a
// site rule, Services everything else the Ledger may set by hand (homes by hand last).
import { content, type BuildingDef, type ZoneDef } from '@qoti/content';
import type { DemandBarView } from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../app/session';
import {
  BRUSHES,
  buildingChoices,
  buildingLock,
  ledgerShelf,
  ledgerShelves,
  lostTownHall,
  SHELF_LABEL,
  SHOPS_STAND_IN,
  teasableLater,
  type Brush,
  type LedgerShelf,
} from '../input/catalog';
import { INPUT_COPY } from '../input/copy';
import type { Tool } from '../input/tool';
import { demandSentence, demandTitle } from './demandWords';
import { Glyph } from './icons';
import { BuildCard, CostLine, Thumb } from './pickerCards';
import { buildingPurpose } from './purpose';
import { RANK_WORD, UNZONE, zoneInk, zoneOpen } from './village';
import './picker.css';

/** Words for the Shops card while the Shops zone is closed. */
/** A line of advice a brush carries (R1B's grain farms want room for fields behind their lot). */
export const BRUSH_TIP: Readonly<Record<string, string>> = {
  farms: 'Zone it deep: a grain farm wants room behind its lot for its fields.',
};

/** The card's own short line; the full words are its tooltip and the line under the picker. */
export const SHOPS_CLOSED_SHORT = 'A Market Stall by hand until Village rank.';

export const SHOPS_CLOSED_WORDS =
  'Shops zone open at Village rank. Until then a Market Stall, set by hand, sells Food and Treats.';

export function LedgerPicker({ session, tool }: { session: Session; tool: Tool }) {
  const m = session.mirror;
  void m.revision.value;
  void m.town.value;
  const mode = m.settings.value.mode;
  const free = mode !== 'standard';
  const shelves = ledgerShelves(mode);
  const all = buildingChoices(mode, 'ledger', lostTownHall(m));
  const locks = new Map(all.map((d) => [d.id, buildingLock(m, d)] as const));
  const defs = all.filter((d) => locks.get(d.id)?.kind !== 'rank');
  const later = teasableLater(all.filter((d) => locks.get(d.id)?.kind === 'rank'));
  const selected = tool.id === 'building' ? content.buildingById.get(tool.variant?.value ?? '') : undefined;
  const [tab, setTab] = useState<LedgerShelf | null>(null);
  const showing: LedgerShelf =
    tool.id === 'zone' && shelves.includes('zones')
      ? 'zones'
      : tab && shelves.includes(tab)
        ? tab
        : selected
          ? ledgerShelf(selected)
          : shelves[0]!;
  const onShelf = (s: Exclude<LedgerShelf, 'zones'>) => defs.filter((d) => ledgerShelf(d) === s);
  const pick = (s: LedgerShelf) => {
    setTab(s);
    const tools = session.tools;
    if (!tools) return;
    if (s === 'zones') {
      tools.select('zone');
      return;
    }
    // Leaving the brushes: the building tool takes a piece from this shelf if its last pick is elsewhere.
    const here = onShelf(s);
    const keep = selected && ledgerShelf(selected) === s && tool.id === 'building';
    if (keep) return;
    const first = here.find((d) => !locks.get(d.id));
    if (first) tools.select('building', first.id);
    else tools.select('building');
  };
  const card = (d: BuildingDef, site = false) => (
    <BuildCard
      key={d.id}
      session={session}
      def={d}
      lock={locks.get(d.id) ?? null}
      on={tool.id === 'building' && tool.variant?.value === d.id}
      free={free}
      site={site}
    />
  );
  const laterHere = later.filter((d) => ledgerShelf(d) === showing);
  return (
    <div class="picker panel ledger-picker" data-testid="building-picker">
      <div class="picker-groups" role="tablist">
        {shelves.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={showing === s}
            class={showing === s ? 'active' : ''}
            data-testid={`group-${s}`}
            onClick={() => pick(s)}
          >
            {SHELF_LABEL[s]}
          </button>
        ))}
        <span class="muted hint">{showing === 'zones' ? INPUT_COPY.zoneHint : tool.hint}</span>
      </div>
      {showing === 'zones' && <ZonesShelf session={session} tool={tool} stay={() => setTab('zones')} />}
      {showing === 'specialized' && (
        <>
          <div class="picker-cards">{onShelf('specialized').map((d) => card(d, true))}</div>
          {selected?.reach && ledgerShelf(selected) === 'specialized' && (
            <p class="picker-purpose" data-testid="reach-note">
              <strong>{selected.name}:</strong> serves up to {selected.reach} tiles along the roads. The
              shaded roads on the ground show it.
            </p>
          )}
        </>
      )}
      {showing === 'services' && (
        <>
          <div class="picker-cards">
            {onShelf('services')
              .filter((d) => d.category !== 'home')
              .map((d) => card(d))}
          </div>
          {onShelf('services').some((d) => d.category === 'home') && (
            <>
              <p class="picker-label muted" data-testid="homes-by-hand">
                Homes by hand
              </p>
              <div class="picker-cards">
                {onShelf('services')
                  .filter((d) => d.category === 'home')
                  .map((d) => card(d))}
              </div>
            </>
          )}
        </>
      )}
      {showing !== 'zones' && laterHere.length > 0 && (
        <p class="picker-later muted" data-testid="building-later">
          {buildingLock(m, laterHere[0]!)?.text}: {laterHere.map((d) => d.name).join(', ')}.
        </p>
      )}
      {showing === 'services' && selected && ledgerShelf(selected) === 'services' && (
        <p class="picker-purpose" data-testid="building-purpose">
          <strong>{selected.name}:</strong> {buildingPurpose(selected)}
          {locks.get(selected.id) ? ` ${locks.get(selected.id)!.text}.` : ''}
        </p>
      )}
    </div>
  );
}

/** The four brushes in demand order, then the eraser, then the chosen one's line. */
function ZonesShelf({ session, tool, stay }: { session: Session; tool: Tool; stay: () => void }) {
  const m = session.mirror;
  const rank = m.town.value?.rank;
  const demand = m.demand.value;
  const on = tool.id === 'zone' ? tool.variant?.value : undefined;
  const placing = tool.id === 'building' ? tool.variant?.value : undefined;
  const chosen = content.zoneById.get(on ?? '');
  return (
    <>
      <div class="picker-cards zone-cards">
        {BRUSHES.map((b) => (
          <BrushCard
            key={b.kind}
            session={session}
            brush={b}
            bar={demand?.bars.find((x) => x.kind === b.kind)}
            on={on}
            placing={placing}
            rank={rank}
            stay={stay}
          />
        ))}
        <button
          type="button"
          class={`card zone-card unzone ${on === UNZONE ? 'active' : ''}`}
          data-testid={`brush-${UNZONE}`}
          title="Grown buildings stay put; empty lots fold away."
          onClick={() => session.tools?.select('zone', UNZONE)}
        >
          <span class="zone-swatch unzone">
            <Glyph id="erase" />
          </span>
          <span class="card-text">
            <strong>Clear zoning</strong>
            <span class="size">Grown buildings stay put.</span>
          </span>
        </button>
      </div>
      {on !== undefined && on !== UNZONE && !zoneOpen(rank, on) ? (
        <p class="zone-locked" data-testid="zone-locked">
          <Glyph id="lock" /> {on === 'shops' ? SHOPS_CLOSED_WORDS : INPUT_COPY.zoneLocked}
        </p>
      ) : (
        <p class="zone-line">
          {chosen ? (
            <>
              <b>{chosen.name}.</b> {chosen.blurb} {BRUSH_TIP[chosen.id] ?? ''}{' '}
            </>
          ) : on === UNZONE ? (
            'Grown buildings stay put; empty lots fold away. '
          ) : null}
        </p>
      )}
    </>
  );
}

function BrushCard({
  session,
  brush,
  bar,
  on,
  placing,
  rank,
  stay,
}: {
  session: Session;
  brush: Brush;
  bar: DemandBarView | undefined;
  on: string | undefined;
  placing: string | undefined;
  rank: Parameters<typeof zoneOpen>[0];
  stay: () => void;
}) {
  const zone = content.zoneById.get(brush.zone)!;
  const open = zoneOpen(rank, brush.zone);
  const tools = session.tools;
  // Shops before Village rank: the card is the Market Stall, set by hand (design note b).
  if (!open && brush.kind === 'shops') {
    const stall = content.buildingById.get(SHOPS_STAND_IN)!;
    const active = placing === SHOPS_STAND_IN;
    return (
      <button
        type="button"
        class={`card zone-card brush stand-in ${active ? 'active' : ''}`}
        data-testid={`brush-${brush.zone}`}
        title={SHOPS_CLOSED_WORDS}
        onClick={() => {
          stay();
          tools?.select('building', SHOPS_STAND_IN);
        }}
      >
        <Thumb kind="building" id={stall.id} />
        <span class="card-text">
          <strong>{zone.name}</strong>
          <span class="brush-line" data-testid="shops-closed">
            {SHOPS_CLOSED_SHORT}
          </span>
          <CostLine
            coins={stall.cost?.coins}
            goods={stall.cost?.goods}
            free={session.mirror.settings.value.mode !== 'standard'}
          />
        </span>
      </button>
    );
  }
  const dense = brush.dense && zoneOpen(rank, brush.dense) ? content.zoneById.get(brush.dense) : undefined;
  const active = on === brush.zone || (!!brush.dense && on === brush.dense);
  // The brush the card paints: the denser one while it is the chosen density.
  const paints = brush.dense && on === brush.dense && dense ? brush.dense : brush.zone;
  const locked = !open;
  return (
    <div class={`card zone-card brush ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}>
      <button
        type="button"
        class="brush-main"
        data-testid={`brush-${brush.zone}`}
        title={[demandTitle(bar, zone.name), BRUSH_TIP[brush.zone]].filter(Boolean).join('\n')}
        aria-disabled={locked}
        onClick={() => (locked ? undefined : tools?.select('zone', paints))}
      >
        <ZoneSwatch zone={zone} />
        <span class="card-text">
          <strong>{zone.name}</strong>
          {locked ? (
            <span class="brush-line">
              <Glyph id="lock" /> At {RANK_WORD[zone.requires?.rank ?? 'village']} rank
            </span>
          ) : (
            <>
              <DemandMeter bar={bar} ink={zoneInk(zone.id)} zoneName={zone.name} />
              <span class="brush-line" data-testid={`brush-why-${brush.kind}`}>
                {bar?.why[0] ?? 'Quiet for now.'}
              </span>
            </>
          )}
        </span>
      </button>
      {dense && (
        <div class="density" role="group" aria-label="Homes density">
          {[
            [brush.zone, 'Cottages'],
            [dense.id, 'Townhouses'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              class={on === id || (!on && id === brush.zone) ? 'active' : ''}
              aria-pressed={on === id}
              data-testid={`variant-${id}`}
              onClick={() => tools?.select('zone', id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ZoneSwatch({ zone }: { zone: ZoneDef }) {
  return (
    <span class="zone-swatch" style={{ '--zone': zoneInk(zone.id) }}>
      <LotShapes sizes={zone.lots.map((l) => l.size)} />
    </span>
  );
}

/** The card's demand bar: horizontal, 0 to 100, lit with the lens accent and a dot, or quiet and soft. */
function DemandMeter({
  bar,
  ink,
  zoneName,
}: {
  bar: DemandBarView | undefined;
  ink: string;
  zoneName: string;
}) {
  const value = Math.max(0, Math.min(100, bar?.value ?? 0));
  return (
    <span
      class={`demand-meter ${bar?.lit ? 'lit' : 'quiet'}`}
      style={{ '--zone': ink }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={demandSentence(bar, zoneName)}
      data-testid="brush-demand"
    >
      <span class="fill" style={{ width: `${value}%` }} />
      {bar?.lit && <span class="dot" />}
    </span>
  );
}

/** Tiny lot diagrams: the shapes a zone cuts, facing a road along the bottom. */
function LotShapes({ sizes }: { sizes: [number, number][] }) {
  let x = 2;
  return (
    <svg viewBox="0 0 30 24" aria-hidden="true">
      <path d="M0 21.5h30" class="lot-road" />
      {sizes.slice(0, 2).map(([w, d], i) => {
        const rect = <rect key={i} x={x} y={20 - d * 4.5} width={w * 4.5} height={d * 4.5} rx="0.8" />;
        x += w * 4.5 + 2;
        return rect;
      })}
    </svg>
  );
}
