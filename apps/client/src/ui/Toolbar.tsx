import { content, type BuildingDef } from '@qoti/content';
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import {
  buildingChoices,
  buildingGroup,
  buildingLock,
  chainsOf,
  costBlock,
  DECOR_GROUP_LABEL,
  decorChoices,
  decorGroup,
  decorGroupsOf,
  GROUP_LABEL,
  groupsOf,
  type BuildingGroup,
  type BuildingLock,
  type Chain,
  type DecorGroup,
} from '../input/catalog';
import type { Tool } from '../input/tool';
import { goodName, thousands } from './format';
import { thumbnail, type ThumbnailKind } from '../render/thumbnails';
import { Glyph, ToolIcon } from './icons';
import { lenses, overlays, toolsForLens, type OverlayDef } from './lenses';
import { rejectText } from './messages';
import { booksFor, toggleBook } from './panels';
import { planSummary } from './plans';
import { INPUT_COPY } from '../input/copy';
import { UNZONE } from './village';
import { rankAtLeast, zoneInk } from './village';
import { GoodIcon } from './goodIcons';
import { buildingPurpose, goodPurpose } from './purpose';

export function Toolbar({ session }: { session: Session }) {
  const manager = session.tools;
  const m = session.mirror;
  const lens = session.ui.lens.value;
  const mode = m.settings.value.mode;
  const active = manager?.active.value ?? 'inspect';
  const overlay = session.ui.overlay.value;
  // I2 (C4E): the village overlays wait for the Village rank.
  const village = (m.charter.value?.rank ?? m.town.value?.rank ?? 'hamlet') !== 'hamlet';
  const lensOverlays =
    mode === 'standard' ? overlays.filter((o) => o.lens === lens && (village || !o.village)) : [];
  // Playtest round six: the Ledger looks at the land unless told otherwise ('off' turns it off).
  const fallback = lens === 'ledger' && lensOverlays.some((o) => o.id === 'resources') ? 'resources' : null;
  const shown = overlay === 'off' ? null : lensOverlays.some((o) => o.id === overlay) ? overlay : fallback;
  // A tool may show its own overlay while it is out (the farm's reach, where clay lies).
  const out = manager?.tool(active);
  void out?.variant?.value;
  const own = out?.overlay?.() ?? null;
  useEffect(() => {
    session.render?.setOverlay(own ?? shown);
  }, [shown, own]);
  if (!manager) return null;
  void m.hamletRevision.value;
  void m.budget.value;
  // Inspecting is what a click does when no tool is out, so it needs no button of its own.
  void m.revision.value;
  const tools = toolsForLens(manager.tools, lens).filter(
    (t) => t.id !== 'inspect' && (!t.modes || t.modes.includes(mode)) && !t.hidden?.(),
  );
  const current = manager.tool(active);
  const accent = lenses.find((l) => l.id === lens)?.accent ?? '#888';
  const books = booksFor(lens, mode);
  const panel = session.ui.panel.value;
  const canUndo = session.undo.size.value > 0;

  return (
    <footer class="toolbar" style={{ '--accent': accent }}>
      {current?.id === 'building' && <BuildingPicker session={session} tool={current} />}
      {(current?.id === 'decor' || current?.id === 'fence') && (
        <DecorPicker session={session} tool={current} linear={current.id === 'fence'} />
      )}
      {current?.id === 'zone' && <ZonePicker session={session} tool={current} />}
      {session.ui.sketch.value && <SketchBar session={session} />}
      {current?.variants &&
        current.variant &&
        !['building', 'decor', 'fence', 'zone'].includes(current.id) && (
          <div class="variants panel">
            {current.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                class={current.variant!.value === v.id ? 'active' : ''}
                data-testid={`variant-${v.id}`}
                onClick={() => manager.select(current.id, v.id)}
              >
                {v.label}
              </button>
            ))}
            {current.hint && <span class="muted hint">{current.hint}</span>}
          </div>
        )}
      {current?.id === 'field' && <FieldHint session={session} />}
      <div class="toolbar-row panel">
        <div class="lenses" role="group" aria-label="Lens" title="Tab switches lens">
          {lenses.map((l) => (
            <button
              key={l.id}
              type="button"
              class={`lens ${lens === l.id ? 'active' : ''}`}
              style={{ '--lens': l.accent }}
              aria-pressed={lens === l.id}
              data-testid={`lens-${l.id}`}
              title={l.blurb}
              onClick={() => (session.ui.lens.value = l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div class="tools">
          {tools.map((t, i) => (
            <button
              key={t.id}
              type="button"
              class={`tool ${active === t.id ? 'active' : ''} ${i > 0 && toolBand(t) !== toolBand(tools[i - 1]!) ? 'band' : ''}`}
              data-testid={`tool-${t.id}`}
              title={`${t.hint ? `${t.label}: ${t.hint}` : t.label}. Esc or a right-click puts it away.`}
              onClick={() => (active === t.id ? manager.putAway() : manager.select(t.id))}
            >
              <span class="icon">
                <ToolIcon id={t.id} fallback={t.icon} />
              </span>
              <span class="label">{t.label}</span>
            </button>
          ))}
        </div>
        {books.length > 0 && (
          <div class="books" role="group" aria-label="Books">
            {books.map((b) => (
              <button
                key={b.id}
                type="button"
                class={`book ${panel === b.id ? 'active' : ''}`}
                data-testid={`book-${b.id}`}
                aria-label={b.label}
                data-tip={b.key ? `${b.label} (${b.key.toUpperCase()})` : b.label}
                onClick={() => toggleBook(session, b.id)}
              >
                <Glyph id={b.icon ?? b.id} />
              </button>
            ))}
          </div>
        )}
        {lensOverlays.length > 0 && (
          <OverlayMenu
            options={lensOverlays}
            shown={shown}
            pick={(id) => (session.ui.overlay.value = id ?? 'off')}
          />
        )}
        <button
          type="button"
          class="undo-button"
          data-testid="undo"
          disabled={!canUndo}
          aria-label="Undo"
          data-tip="Undo your last change (Ctrl+Z)"
          onClick={() => session.undoLast()}
        >
          <Glyph id="undo" />
        </button>
      </div>
    </footer>
  );
}

/** Tools fall in bands (look, make, talk, take away); a little air separates the bands. */
function toolBand(t: Tool): number {
  const o = t.order ?? 50;
  return o < 10 ? 0 : o < 70 ? 1 : o < 90 ? 2 : 3;
}

/** One button for the lens's overlays: it names the one showing, and opens a short list. */
function OverlayMenu({
  options,
  shown,
  pick,
}: {
  options: OverlayDef[];
  shown: string | null;
  pick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && (e.target as Element | null)?.closest('.overlay-menu')) return;
      setOpen(false);
    };
    addEventListener('pointerdown', close, true);
    addEventListener('keydown', close, true);
    return () => {
      removeEventListener('pointerdown', close, true);
      removeEventListener('keydown', close, true);
    };
  }, [open]);
  const current = options.find((o) => o.id === shown);
  return (
    <div class="overlay-menu">
      {open && (
        <div class="overlay-list panel" role="menu" data-testid="overlay-list">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={shown === o.id}
              class={shown === o.id ? 'active' : ''}
              data-testid={`overlay-${o.id}`}
              onClick={() => {
                pick(shown === o.id ? null : o.id);
                setOpen(false);
              }}
            >
              <Glyph id={o.icon} />
              <span>
                <b>{o.label}</b>
                <span class="muted">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        class={`overlay-button ${current ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="overlays"
        data-tip="Overlays: see the valley another way"
        onClick={() => setOpen(!open)}
      >
        <Glyph id={current?.icon ?? 'eye'} />
        <span>{current ? current.label : 'View'}</span>
      </button>
      {current && (
        <button
          type="button"
          class="overlay-clear"
          aria-label={`Hide ${current.label}`}
          data-testid="overlay-clear"
          onClick={() => pick(null)}
        >
          ×
        </button>
      )}
    </div>
  );
}

function CostLine({ coins, goods, free }: { coins?: number; goods?: [string, number][]; free: boolean }) {
  if (free) return <span class="cost muted">Free in a creative valley</span>;
  if (!coins && !goods?.length) return <span class="cost muted">No cost</span>;
  return (
    <span class="cost">
      {coins ? (
        <span class="coins">
          <Glyph id="coin" />
          {thousands(coins)}
        </span>
      ) : null}
      {goods?.map(([g, q]) => (
        <span key={g} class="mat">
          {q} {goodName(g).toLowerCase()}
        </span>
      ))}
    </span>
  );
}

/** A card's little portrait of the piece, drawn from its art kit (blank until it is ready). */
function Thumb({ kind, id }: { kind: ThumbnailKind; id: string }) {
  const url = thumbnail(kind, id).value;
  return <span class="thumb">{url && <img src={url} alt="" draggable={false} />}</span>;
}

/**
 * The Build picker: the valley's buildings by group. Playtest round six: Food and Materials show
 * their production chains, a row each, from the buildings that start from nothing to the ones that
 * finish the goods, with the goods that pass between them; buildings the town has not opened yet
 * stay in their chain, greyed, saying what opens them; those for a later rank wait off the page.
 */
function BuildingPicker({ session, tool }: { session: Session; tool: Tool }) {
  const m = session.mirror;
  void m.revision.value;
  void m.town.value;
  const mode = m.settings.value.mode;
  const all = buildingChoices(mode, session.ui.lens.value);
  const locks = new Map(all.map((d) => [d.id, buildingLock(m, d)] as const));
  const defs = all.filter((d) => locks.get(d.id)?.kind !== 'rank');
  const later = all.filter((d) => locks.get(d.id)?.kind === 'rank');
  const groups = groupsOf(defs);
  const selected = content.buildingById.get(tool.variant?.value ?? '');
  const [group, setGroup] = useState<BuildingGroup | null>(null);
  const showing = group && groups.includes(group) ? group : selected ? buildingGroup(selected) : groups[0];
  const cards = defs.filter((d) => buildingGroup(d) === showing);
  const free = mode !== 'standard';
  const chained = showing === 'food' || showing === 'materials';
  const card = (d: BuildingDef) => (
    <BuildCard
      key={d.id}
      session={session}
      def={d}
      lock={locks.get(d.id) ?? null}
      on={tool.variant?.value === d.id}
      free={free}
      compact={chained}
    />
  );
  const laterHere = later.filter((d) => buildingGroup(d) === showing);
  return (
    <div class="picker panel" data-testid="building-picker">
      {groups.length > 1 && (
        <div class="picker-groups" role="tablist">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={showing === g}
              class={showing === g ? 'active' : ''}
              data-testid={`group-${g}`}
              onClick={() => setGroup(g)}
            >
              {GROUP_LABEL[g]}
            </button>
          ))}
          <span class="muted hint">{tool.hint}</span>
        </div>
      )}
      {chained ? (
        <div class="picker-chains" data-testid="building-chains">
          {chainsOf(cards).map((c) => (
            <div class="chain-row" key={c.columns[0]![0]!.id}>
              <span class="chain-label" title={c.makes.map(goodPurpose).join(' ')}>
                {chainLabel(c)}
              </span>
              {c.columns.map((col, i) => (
                <Fragment key={i}>
                  {i > 0 && (
                    <span class="chain-flow" title={c.flows[i - 1]!.map(goodPurpose).join(' ')}>
                      {c.flows[i - 1]!.map((g) => (
                        <GoodIcon key={g} good={g} />
                      ))}
                      <span class="arrow" aria-hidden="true">
                        →
                      </span>
                    </span>
                  )}
                  <span class="chain-col">{col.map(card)}</span>
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div class="picker-cards">{cards.map(card)}</div>
      )}
      {laterHere.length > 0 && (
        <p class="picker-later muted" data-testid="building-later">
          {buildingLock(m, laterHere[0]!)?.text}: {laterHere.map((d) => d.name).join(', ')}.
        </p>
      )}
      {/* Playtest round five: what the chosen building is for, without hunting for a tooltip. */}
      {selected && (
        <p class="picker-purpose" data-testid="building-purpose">
          <strong>{selected.name}:</strong> {buildingPurpose(selected)}
          {locks.get(selected.id) ? ` ${locks.get(selected.id)!.text}.` : ''}
        </p>
      )}
    </div>
  );
}

/** "Bread, from wheat": what a chain ends in, and what it starts from when that is different. */
function chainLabel(c: Chain): string {
  const end = c.makes.map((g) => goodName(g)).join(', ');
  if (c.columns.length < 2) return end || 'Upkeep';
  const raw = [
    ...new Set(c.columns[0]!.flatMap((d) => (d.methods ?? []).flatMap((m) => m.outputs.map(([g]) => g)))),
  ];
  const from = raw.filter((g) => !c.makes.includes(g)).map((g) => goodName(g).toLowerCase());
  if (!from.length) return end;
  return `${end}, from ${from.length > 1 ? `${from.slice(0, -1).join(', ')} and ${from[from.length - 1]}` : from[0]}`;
}

/** One building in the picker: portrait, name, cost; greyed with its reason while locked. */
function BuildCard({
  session,
  def: d,
  lock,
  on,
  free,
  compact,
}: {
  session: Session;
  def: BuildingDef;
  lock: BuildingLock | null;
  on: boolean;
  free: boolean;
  compact: boolean;
}) {
  const m = session.mirror;
  const blocked = free || lock ? null : costBlock(m, d.cost);
  const title = [lock?.text ? `${lock.text}.` : '', blocked ? rejectText(blocked) : '', buildingPurpose(d)]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      class={`card ${compact ? 'compact' : ''} ${on ? 'active' : ''} ${blocked ? 'short' : ''} ${lock ? 'locked' : ''}`}
      data-testid={`variant-${d.id}`}
      title={title}
      disabled={!!lock}
      onClick={() => session.tools?.select('building', d.id)}
    >
      <Thumb kind="building" id={d.id} />
      <span class="card-text">
        <strong>{d.name}</strong>
        {lock ? (
          <span class="lock-why muted">{lock.text}</span>
        ) : (
          <>
            {!compact && (
              <span class="size">
                {d.size[0]} × {d.size[1]}
                {!free && d.jobs ? `, ${d.jobs.count} ${d.jobs.count === 1 ? 'job' : 'jobs'}` : ''}
                {!free && d.housing ? `, homes ${d.housing.residents}` : ''}
              </span>
            )}
            <CostLine coins={d.cost?.coins} goods={d.cost?.goods} free={free} />
            {!compact && !free && d.upkeep ? (
              <span class="upkeep muted">{d.upkeep} a day to keep</span>
            ) : null}
          </>
        )}
      </span>
    </button>
  );
}

/** Decor and fence pickers: Pattern Book pieces show locked, with the hint that unlocks them. */
function DecorPicker({ session, tool, linear }: { session: Session; tool: Tool; linear: boolean }) {
  const m = session.mirror;
  const free = m.settings.value.mode !== 'standard';
  const all = decorChoices(m, 'hearth', linear);
  const groups = linear ? [] : decorGroupsOf(all);
  const selected = all.find((c) => c.def.id === tool.variant?.value);
  const [group, setGroup] = useState<DecorGroup | null>(null);
  const showing =
    group && groups.includes(group) ? group : selected ? decorGroup(selected.def) : (groups[0] ?? null);
  const choices = showing ? all.filter((c) => decorGroup(c.def) === showing) : all;
  return (
    <div class="picker panel decor-picker" data-testid={linear ? 'fence-picker' : 'decor-picker'}>
      {groups.length > 1 && (
        <div class="picker-groups" role="tablist">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={showing === g}
              class={showing === g ? 'active' : ''}
              data-testid={`decor-group-${g}`}
              onClick={() => setGroup(g)}
            >
              {DECOR_GROUP_LABEL[g]}
            </button>
          ))}
          {tool.hint && <span class="muted hint">{tool.hint}</span>}
        </div>
      )}
      <div class="picker-cards">
        {choices.map(({ def, locked, hint }) => {
          const on = tool.variant?.value === def.id;
          return (
            <button
              key={def.id}
              type="button"
              class={`card small ${on ? 'active' : ''} ${locked ? 'locked' : ''}`}
              aria-disabled={locked}
              data-testid={`variant-${def.id}`}
              title={locked ? hint : def.name}
              onClick={() => (locked ? session.toast(hint) : session.tools?.select(tool.id, def.id))}
            >
              {locked && <Glyph id="lock" class="lock" />}
              <Thumb kind="decor" id={def.id} />
              <span class="card-text">
                <strong>{def.name}</strong>
                {locked ? (
                  <span class="cost muted">In the Pattern Book</span>
                ) : (
                  !free && def.cost?.coins && <CostLine coins={def.cost.coins} free={false} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      {groups.length <= 1 && tool.hint && <span class="muted hint picker-hint">{tool.hint}</span>}
    </div>
  );
}

/** Which farmhouse the field tool is sowing for. */
function FieldHint({ session }: { session: Session }) {
  const id = session.ui.farm.value;
  const b = id !== null ? session.mirror.buildings.get(id) : undefined;
  return (
    <div class="variants panel field-hint" data-testid="field-hint">
      <Glyph id="field" />
      <span>
        {b
          ? 'Sowing for the farmhouse. Drag a box within reach; the tint shows the soil, and Shift+drag clears. A coin a tile.'
          : 'Click a farmhouse first. Fields have to be within reach of someone with a hoe.'}
      </span>
    </div>
  );
}

/** I2 (C4F): the zone picker: each zone with its color and lot shapes, the chosen one's line below. */
function ZonePicker({ session, tool }: { session: Session; tool: Tool }) {
  const m = session.mirror;
  const open = rankAtLeast(m.town.value?.rank, 'village');
  const on = tool.variant?.value;
  const zones = [...content.zones].sort((a, b) => a.layerValue - b.layerValue);
  const chosen = zones.find((z) => z.id === on);
  return (
    <div class="picker panel zone-picker" data-testid="zone-picker">
      <div class="picker-cards zone-cards">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            class={`card zone-card ${on === z.id ? 'active' : ''} ${open ? '' : 'locked'}`}
            aria-disabled={!open}
            data-testid={`variant-${z.id}`}
            title={z.blurb}
            onClick={() => session.tools?.select('zone', z.id)}
          >
            <span class="zone-swatch" style={{ '--zone': zoneInk(z.id) }}>
              <LotShapes sizes={z.lots.map((l) => l.size)} />
            </span>
            <span class="card-text">
              <strong>{z.name}</strong>
              <span class="size">{z.density === 'medium' ? 'Snug' : 'Roomy'}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          class={`card zone-card unzone ${on === UNZONE ? 'active' : ''}`}
          data-testid={`variant-${UNZONE}`}
          title="Grown buildings stay put; empty lots fold away."
          onClick={() => session.tools?.select('zone', UNZONE)}
        >
          <span class="zone-swatch unzone">
            <Glyph id="erase" />
          </span>
          <span class="card-text">
            <strong>Unzone</strong>
            <span class="size">Clear it</span>
          </span>
        </button>
      </div>
      {open ? (
        <p class="zone-line">
          {chosen ? (
            <>
              <b>{chosen.name}.</b> {chosen.blurb}{' '}
            </>
          ) : (
            'Grown buildings stay put; empty lots fold away. '
          )}
          <span class="muted">{tool.hint}</span>
        </p>
      ) : (
        <p class="zone-locked" data-testid="zone-locked">
          <Glyph id="lock" /> {INPUT_COPY.zoneLocked}
        </p>
      )}
    </div>
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

/** I2 (C4F): while sketching, a ribbon over the toolbar says so and offers to finish. */
function SketchBar({ session }: { session: Session }) {
  const sketch = session.ui.sketch.value!;
  const n = sketch.items.length;
  return (
    <div class="variants panel sketch-bar" data-testid="sketch-bar">
      <Glyph id="plan" />
      <span>
        <b>Sketching.</b> {n ? planSummary(sketch.items) : 'Whatever you place now is ink, not timber.'}
      </span>
      <button
        type="button"
        class="small-button"
        data-testid="sketch-review"
        onClick={() => (session.ui.panel.value = 'plans')}
      >
        {n ? 'Name it and propose' : 'Plans'}
      </button>
      <button
        type="button"
        class="small-button"
        data-testid="sketch-stop"
        onClick={() => (session.ui.sketch.value = null)}
      >
        Stop
      </button>
    </div>
  );
}
