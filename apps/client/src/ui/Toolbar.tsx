import { content } from '@qoti/content';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import {
  buildingChoices,
  buildingGroup,
  costBlock,
  DECOR_GROUP_LABEL,
  decorChoices,
  decorGroup,
  decorGroupsOf,
  GROUP_LABEL,
  groupsOf,
  type BuildingGroup,
  type DecorGroup,
} from '../input/catalog';
import type { Tool } from '../input/tool';
import { goodName, thousands } from './format';
import { thumbnail, type ThumbnailKind } from '../render/thumbnails';
import { Glyph, ToolIcon } from './icons';
import { lenses, overlays, toolsForLens } from './lenses';
import { rejectText } from './messages';
import { booksFor, toggleBook } from './panels';
import { planSummary } from './plans';
import { INPUT_COPY } from '../input/copy';
import { UNZONE } from './village';
import { RANK_WORD, rankAtLeast, zoneInk } from './village';

export function Toolbar({ session }: { session: Session }) {
  const manager = session.tools;
  const m = session.mirror;
  const lens = session.ui.lens.value;
  const mode = m.settings.value.mode;
  const active = manager?.active.value ?? 'inspect';
  const overlay = session.ui.overlay.value;
  const lensOverlays = mode === 'standard' ? overlays.filter((o) => o.lens === lens) : [];
  const shown = lensOverlays.some((o) => o.id === overlay) ? overlay : null;
  // The field tool shows its own overlay (the farm's reach) while it is out.
  useEffect(() => {
    if (active !== 'field') session.render?.setOverlay(shown);
  }, [shown, active]);
  if (!manager) return null;
  void m.hamletRevision.value;
  void m.budget.value;
  const tools = toolsForLens(manager.tools, lens).filter((t) => !t.modes || t.modes.includes(mode));
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
        <div class="lenses" title="Tab switches lens">
          {lenses.map((l) => (
            <button
              key={l.id}
              type="button"
              class={`lens ${lens === l.id ? 'active' : ''}`}
              style={{ '--lens': l.accent }}
              data-testid={`lens-${l.id}`}
              title={l.blurb}
              onClick={() => (session.ui.lens.value = l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div class="tools">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              class={`tool ${active === t.id ? 'active' : ''}`}
              data-testid={`tool-${t.id}`}
              title={t.hint ? `${t.label}: ${t.hint}` : t.label}
              onClick={() => manager.select(t.id)}
            >
              <span class="icon">
                <ToolIcon id={t.id} fallback={t.icon} />
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {books.length > 0 && (
          <div class="books">
            {books.map((b) => (
              <button
                key={b.id}
                type="button"
                class={`tool book ${panel === b.id ? 'active' : ''}`}
                data-testid={`book-${b.id}`}
                title={b.key ? `${b.label} (${b.key.toUpperCase()})` : b.label}
                onClick={() => toggleBook(session, b.id)}
              >
                <span class="icon">
                  <Glyph id={b.icon ?? b.id} />
                </span>
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        )}
        {lensOverlays.length > 0 && (
          <div class="overlay-toggles" role="group" aria-label="Overlays">
            {lensOverlays.map((o) => (
              <button
                key={o.id}
                type="button"
                class={`overlay-toggle ${shown === o.id ? 'active' : ''}`}
                aria-pressed={shown === o.id}
                data-testid={`overlay-${o.id}`}
                title={o.hint}
                onClick={() => (session.ui.overlay.value = shown === o.id ? null : o.id)}
              >
                <Glyph id={o.icon} />
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          class="undo-button"
          data-testid="undo"
          disabled={!canUndo}
          title="Undo your last change (Ctrl+Z)"
          onClick={() => session.undoLast()}
        >
          <Glyph id="undo" />
        </button>
      </div>
    </footer>
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

/** The Build picker: the valley's buildings by group, each card with its footprint and cost. */
function BuildingPicker({ session, tool }: { session: Session; tool: Tool }) {
  const m = session.mirror;
  const mode = m.settings.value.mode;
  const defs = buildingChoices(mode, session.ui.lens.value);
  const groups = groupsOf(defs);
  const selected = content.buildingById.get(tool.variant?.value ?? '');
  const [group, setGroup] = useState<BuildingGroup | null>(null);
  const showing = group && groups.includes(group) ? group : selected ? buildingGroup(selected) : groups[0];
  const cards = defs.filter((d) => buildingGroup(d) === showing);
  const free = mode !== 'standard';
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
      <div class="picker-cards">
        {cards.map((d) => {
          const blocked = free ? null : costBlock(m, d.cost);
          const on = tool.variant?.value === d.id;
          return (
            <button
              key={d.id}
              type="button"
              class={`card ${on ? 'active' : ''} ${blocked ? 'short' : ''}`}
              data-testid={`variant-${d.id}`}
              title={blocked ? rejectText(blocked) : undefined}
              onClick={() => session.tools?.select('building', d.id)}
            >
              <Thumb kind="building" id={d.id} />
              <span class="card-text">
                <strong>{d.name}</strong>
                <span class="size">
                  {d.size[0]} × {d.size[1]}
                  {!free && d.jobs ? `, ${d.jobs.count} ${d.jobs.count === 1 ? 'job' : 'jobs'}` : ''}
                  {!free && d.housing ? `, homes ${d.housing.residents}` : ''}
                </span>
                <CostLine coins={d.cost?.coins} goods={d.cost?.goods} free={free} />
                {!free && d.upkeep ? <span class="upkeep muted">{d.upkeep} a day to keep</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
          ? 'Sowing for the farmhouse. Drag a box of fertile ground; Shift+drag clears. A coin a tile.'
          : 'Click a farmhouse first. Fields have to be within reach of someone with a hoe.'}
      </span>
    </div>
  );
}

/** I2 (C4F): the zone picker: each zone with its color, what grows there and its lot shapes. */
function ZonePicker({ session, tool }: { session: Session; tool: Tool }) {
  const m = session.mirror;
  const open = rankAtLeast(m.town.value?.rank, 'village');
  const on = tool.variant?.value;
  return (
    <div class="picker panel zone-picker" data-testid="zone-picker">
      {!open && (
        <p class="zone-locked" data-testid="zone-locked">
          <Glyph id="lock" /> {INPUT_COPY.zoneLocked} You are a {RANK_WORD[m.town.value?.rank ?? 'hamlet']}{' '}
          for now.
        </p>
      )}
      <div class="picker-cards">
        {content.zones.map((z) => (
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
              <span class="zone-blurb">{z.blurb}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          class={`card zone-card unzone ${on === UNZONE ? 'active' : ''}`}
          data-testid={`variant-${UNZONE}`}
          title="Clear zoning. Grown buildings stay; empty lots go."
          onClick={() => session.tools?.select('zone', UNZONE)}
        >
          <span class="zone-swatch unzone">
            <Glyph id="erase" />
          </span>
          <span class="card-text">
            <strong>Unzone</strong>
            <span class="zone-blurb">Grown buildings stay put; empty lots fold away.</span>
          </span>
        </button>
      </div>
      <span class="muted hint picker-hint">{tool.hint}</span>
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
