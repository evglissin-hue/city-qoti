import { content, type BuildingDef } from '@qoti/content';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import {
  buildingChoices,
  buildingGroup,
  buildingLock,
  teasableLater,
  choiceGroup,
  DECOR_GROUP_LABEL,
  decorChoices,
  decorGroupsOf,
  GROUP_LABEL,
  groupsOf,
  lostTownHall,
  type BuildingGroup,
  type DecorGroup,
} from '../input/catalog';
import type { Tool } from '../input/tool';
import { Glyph, ToolIcon } from './icons';
import { LedgerPicker } from './Picker';
import { BuildCard, CostLine, Thumb } from './pickerCards';
import { lenses, overlays, toolsForLens, type OverlayDef } from './lenses';
import { bookMark } from './bookMarks';
import { booksFor, toggleBook, type PanelDef } from './panels';
import { barSlots, slotBand, type BarSlot } from './toolGroups';
import { planSummary } from './plans';
import { buildingPurpose } from './purpose';

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
    session.render?.setOverlay(own ?? (shown === 'town' ? `town:${lens}` : shown));
  }, [shown, own, lens]);
  // P2-D: the Ledger marks sites waiting for materials or builders without the Status overlay.
  useEffect(() => {
    session.render?.setSiteMarkers?.(lens === 'ledger');
  }, [lens]);
  if (!manager) return null;
  void m.hamletRevision.value;
  void m.budget.value;
  // Inspecting is what a click does when no tool is out, so it needs no button of its own.
  void m.revision.value;
  const tools = toolsForLens(manager.tools, lens).filter(
    (t) => t.id !== 'inspect' && (!t.modes || t.modes.includes(mode)) && !t.hidden?.(),
  );
  const slots = barSlots(tools, lens);
  const current = manager.tool(active);
  const accent = lenses.find((l) => l.id === lens)?.accent ?? '#888';
  const books = booksFor(lens, mode);
  // P3B: the group whose tool is out shows its kinds on a small shelf over the bar.
  const openGroup = slots.find(
    (s): s is Extract<BarSlot, { kind: 'group' }> =>
      s.kind === 'group' && s.members.some((x) => x.tool.id === active),
  );

  return (
    <>
      <footer class="toolbar" style={{ '--accent': accent }}>
        {current?.id === 'building' && lens === 'hearth' && (
          <BuildingPicker session={session} tool={current} />
        )}
        {/* R1C: the Ledger's picker has three shelves, and the zone brushes live on the first. */}
        {(current?.id === 'building' || current?.id === 'zone') && lens === 'ledger' && (
          <LedgerPicker session={session} tool={current} />
        )}
        {(current?.id === 'decor' || current?.id === 'fence') && (
          <DecorPicker session={session} tool={current} linear={current.id === 'fence'} />
        )}
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
        {openGroup && <KindShelf session={session} slot={openGroup} active={active} />}
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
                title={`${l.blurb} (Tab switches lens)`}
                onClick={() => (session.ui.lens.value = l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div class="tools" role="group" aria-label="Tools">
            {slots.map((slot, i) => {
              const band = i > 0 && slotBand(slot) !== slotBand(slots[i - 1]!) ? 'band' : '';
              return slot.kind === 'group' ? (
                <GroupButton key={slot.group.id} session={session} slot={slot} active={active} band={band} />
              ) : (
                <ToolButton
                  key={slot.tool.id}
                  session={session}
                  tool={slot.tool}
                  active={active}
                  band={band}
                />
              );
            })}
          </div>
          {books.length > 0 && <BooksShelf session={session} books={books} />}
        </div>
      </footer>
      <ViewCorner session={session} options={lensOverlays} shown={shown} accent={accent} />
    </>
  );
}

/** Closes a popover on Escape or a press outside the element matching `inside`. */
function useDismiss(open: boolean, close: () => void, inside: string) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && (e.target as Element | null)?.closest(inside)) return;
      if (e instanceof KeyboardEvent) e.stopPropagation();
      close();
    };
    addEventListener('pointerdown', handler, true);
    addEventListener('keydown', handler, true);
    return () => {
      removeEventListener('pointerdown', handler, true);
      removeEventListener('keydown', handler, true);
    };
  }, [open]);
}

function ToolButton({
  session,
  tool,
  active,
  band,
}: {
  session: Session;
  tool: Tool;
  active: string;
  band: string;
}) {
  const manager = session.tools!;
  const lens = session.ui.lens.value;
  // R1C: in a standard Ledger the Build button opens the picker on the Zones shelf (the zone tool
  // has no button of its own), so it reads as chosen while a brush is out.
  const zoning =
    tool.id === 'building' && lens === 'ledger' && session.mirror.settings.value.mode === 'standard';
  const on = active === tool.id || (zoning && active === 'zone');
  return (
    <button
      type="button"
      class={`tool ${on ? 'active' : ''} ${band}`}
      data-testid={`tool-${tool.id}`}
      aria-pressed={on}
      title={`${tool.hint ? `${tool.label}: ${tool.hint}` : tool.label}. Esc or a right-click puts it away.`}
      onClick={() => (on ? manager.putAway() : zoning ? manager.select('zone') : manager.select(tool.id))}
    >
      <span class="icon">
        <ToolIcon id={tool.id} fallback={tool.icon} />
      </span>
      <span class="label">{tool.label}</span>
    </button>
  );
}

/** The kind of each group the player last took out, so the group's button picks it up again. */
const lastKind = new Map<string, string>();

function GroupButton({
  session,
  slot,
  active,
  band,
}: {
  session: Session;
  slot: Extract<BarSlot, { kind: 'group' }>;
  active: string;
  band: string;
}) {
  const manager = session.tools!;
  const inHand = slot.members.find((x) => x.tool.id === active);
  const remembered = slot.members.find((x) => x.tool.id === lastKind.get(slot.group.id));
  const face = inHand ?? remembered ?? slot.members[0]!;
  const kinds = slot.members.map((x) => x.label).join(', ');
  return (
    <button
      type="button"
      class={`tool group ${inHand ? 'active' : ''} ${band}`}
      data-testid={`tool-group-${slot.group.id}`}
      aria-pressed={!!inHand}
      aria-expanded={!!inHand}
      title={`${slot.group.label}: ${kinds}. Takes out ${face.label}; the others are on the shelf above. Esc or a right-click puts it away.`}
      onClick={() => {
        if (inHand) return manager.putAway();
        lastKind.set(slot.group.id, face.tool.id);
        manager.select(face.tool.id);
      }}
    >
      <span class="icon">
        <ToolIcon id={face.tool.id} fallback={face.tool.icon} />
      </span>
      <span class="label">
        {slot.group.label}
        <i class="more" aria-hidden="true" />
      </span>
    </button>
  );
}

/** The kinds of the group in hand, a small row of named buttons just over the bar. */
function KindShelf({
  session,
  slot,
  active,
}: {
  session: Session;
  slot: Extract<BarSlot, { kind: 'group' }>;
  active: string;
}) {
  const manager = session.tools!;
  return (
    <div
      class="kinds panel"
      role="group"
      aria-label={slot.group.label}
      data-testid={`kinds-${slot.group.id}`}
    >
      {slot.members.map(({ tool, label }) => (
        <button
          key={tool.id}
          type="button"
          class={`kind ${active === tool.id ? 'active' : ''}`}
          aria-pressed={active === tool.id}
          data-testid={`tool-${tool.id}`}
          title={tool.hint ? `${tool.label}: ${tool.hint}` : tool.label}
          onClick={() => {
            lastKind.set(slot.group.id, tool.id);
            if (active !== tool.id) manager.select(tool.id);
          }}
        >
          <ToolIcon id={tool.id} fallback={tool.icon} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** P3B: one named Books button; its shelf names every book of the lens and marks what is new. */
function BooksShelf({ session, books }: { session: Session; books: PanelDef[] }) {
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false), '.books-menu');
  const panel = session.ui.panel.value;
  const reading = books.find((b) => b.id === panel);
  void session.ui.lettersRead.value;
  void session.mirror.hamletRevision.value;
  const marks = new Map(books.map((b) => [b.id, bookMark(session, b.id)] as const));
  const waiting = [...marks.values()].reduce((n, x) => n + (x?.count ?? 0), 0);
  return (
    <div class="books-menu">
      {open && (
        <div class="books-list panel" role="menu" aria-label="Books" data-testid="books-list">
          {books.map((b) => {
            const mark = marks.get(b.id);
            return (
              <button
                key={b.id}
                type="button"
                role="menuitem"
                class={panel === b.id ? 'active' : ''}
                aria-current={panel === b.id}
                data-testid={`book-${b.id}`}
                onClick={() => {
                  setOpen(false);
                  toggleBook(session, b.id);
                }}
              >
                <Glyph id={b.icon ?? b.id} />
                <span class="book-name">{b.label}</span>
                {mark && <span class="book-mark">{mark.words}</span>}
                {b.key && <kbd>{b.key.toUpperCase()}</kbd>}
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        class={`books-button ${reading ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="books"
        title={`The ${session.ui.lens.value === 'hearth' ? 'Hearth' : 'Ledger'}'s books${reading ? `; ${reading.label} is open` : ''}. Each has its key on the shelf.`}
        onClick={() => setOpen(!open)}
      >
        <Glyph id="books" />
        <span>{reading ? reading.label : 'Books'}</span>
        {waiting > 0 && !reading && (
          <b class="books-dot" aria-label={`${waiting} new or waiting`}>
            {waiting}
          </b>
        )}
      </button>
    </div>
  );
}

/** P3B: the view, undo and the camera, in a small cluster of their own under the map. */
function ViewCorner({
  session,
  options,
  shown,
  accent,
}: {
  session: Session;
  options: OverlayDef[];
  shown: string | null;
  accent: string;
}) {
  const canUndo = session.undo.size.value > 0;
  return (
    <div class="view-corner panel" role="group" aria-label="View" style={{ '--accent': accent }}>
      {options.length > 0 && (
        <OverlayMenu
          options={options}
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
      <button
        type="button"
        class="undo-button photo-button"
        data-testid="photo-open"
        aria-label="Photo mode"
        data-tip="Photo mode: hide the interface and take a picture (F2)"
        onClick={() => (session.ui.photo.value = true)}
      >
        <Glyph id="photo" />
      </button>
    </div>
  );
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
  useDismiss(open, () => setOpen(false), '.overlay-menu');
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

/**
 * The Hearth's Build picker: homes, specialized pieces and services as groups (the Ledger has its
 * three shelves in Picker.tsx). Buildings the town has not opened yet show greyed, saying what
 * opens them; those for a later rank wait off the page.
 */
function BuildingPicker({ session, tool }: { session: Session; tool: Tool }) {
  const m = session.mirror;
  void m.revision.value;
  void m.town.value;
  const mode = m.settings.value.mode;
  const all = buildingChoices(mode, session.ui.lens.value, lostTownHall(m));
  const locks = new Map(all.map((d) => [d.id, buildingLock(m, d)] as const));
  const defs = all.filter((d) => locks.get(d.id)?.kind !== 'rank');
  const later = teasableLater(all.filter((d) => locks.get(d.id)?.kind === 'rank'));
  const groups = groupsOf(defs);
  const selected = content.buildingById.get(tool.variant?.value ?? '');
  const [group, setGroup] = useState<BuildingGroup | null>(null);
  const showing = group && groups.includes(group) ? group : selected ? buildingGroup(selected) : groups[0];
  const cards = defs.filter((d) => buildingGroup(d) === showing);
  const free = mode !== 'standard';
  const card = (d: BuildingDef) => (
    <BuildCard
      key={d.id}
      session={session}
      def={d}
      lock={locks.get(d.id) ?? null}
      on={tool.variant?.value === d.id}
      free={free}
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
      <div class="picker-cards">{cards.map(card)}</div>
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

/** Decor and fence pickers: Pattern Book pieces show locked, with the hint that unlocks them. */
function DecorPicker({ session, tool, linear }: { session: Session; tool: Tool; linear: boolean }) {
  const m = session.mirror;
  const free = m.settings.value.mode !== 'standard';
  const all = decorChoices(m, 'hearth', linear);
  const groups = linear ? [] : decorGroupsOf(all);
  const selected = all.find((c) => c.def.id === tool.variant?.value);
  const [group, setGroup] = useState<DecorGroup | null>(null);
  const showing =
    group && groups.includes(group) ? group : selected ? choiceGroup(selected) : (groups[0] ?? null);
  const choices = showing ? all.filter((c) => choiceGroup(c) === showing) : all;
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
      {showing === 'festival' && (
        <p class="muted hint picker-hint" data-testid="festival-pieces-hint">
          Set these out on the festival site. They come down the morning after, unless you keep one.
        </p>
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
                  <span class="cost muted">
                    {def.festival ? 'With a festival plan' : 'In the Pattern Book'}
                  </span>
                ) : (
                  !free && def.cost && <CostLine coins={def.cost.coins} goods={def.cost.goods} free={false} />
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

/** Which grain farm the field tool is sowing for. */
function FieldHint({ session }: { session: Session }) {
  const id = session.ui.farm.value;
  const b = id !== null ? session.mirror.buildings.get(id) : undefined;
  return (
    <div class="variants panel field-hint" data-testid="field-hint">
      <Glyph id="field" />
      <span>
        {b
          ? 'Sowing for the grain farm. Drag a box within reach; the tint shows the soil, and Shift+drag clears. A coin a tile.'
          : 'Click a grain farm first. Fields have to be within reach of someone with a hoe.'}
      </span>
    </div>
  );
}

/** I2 (C4F): while sketching, a ribbon over the toolbar says so and offers to finish. */
function SketchBar({ session }: { session: Session }) {
  const sketch = session.ui.sketch.value!;
  const n = sketch.items.length;
  // R1C: editing a plan in place says so, and its button goes to the card's Save changes.
  const editing = sketch.basedOn !== null;
  return (
    <div class="variants panel sketch-bar" data-testid="sketch-bar">
      <Glyph id="plan" />
      <span>
        <b>{editing ? 'Redrawing the plan.' : 'Sketching.'}</b>{' '}
        {n ? planSummary(sketch.items) : 'Whatever you place now is ink, not timber.'}
      </span>
      <button
        type="button"
        class="small-button"
        data-testid="sketch-review"
        onClick={() => (session.ui.panel.value = 'plans')}
      >
        {editing ? 'Review the changes' : n ? 'Name it and propose' : 'Plans'}
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
