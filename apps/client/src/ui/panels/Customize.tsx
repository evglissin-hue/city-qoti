import { content } from '@qoti/content';
import { MAX_SIGN_CHARS, type BuildingCustom, type BuildingDetail } from '@qoti/sim';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { swatchGroups, swatchHex, type Swatch } from '../swatches';
import { Frame, Heading, Toggle, useInspect } from './parts';

type Draft = Record<string, string | boolean | null | undefined>;

type Key = keyof BuildingCustom;

/**
 * Paint and details for one building: wall, roof and accent swatches, roof material, window boxes,
 * shutters, chimney and a shop sign. Each choice is its own build.customize (and its own undo).
 */
export function CustomizePanel({ session }: { session: Session }) {
  const id = session.ui.customize.value;
  const m = session.mirror;
  void m.revision.value;
  const b = id !== null ? m.buildings.get(id) : undefined;
  const [draft, setDraft] = useState<Draft>({});
  const [sign, setSign] = useState('');
  useEffect(() => {
    setDraft({});
    setSign(typeof b?.custom?.sign === 'string' ? b.custom.sign : '');
  }, [id]);
  if (id === null || !b) return null;
  const def = content.buildingById.get(b.def);
  const groups = swatchGroups();
  const value = (key: Key) => (key in draft ? draft[key] : b.custom?.[key]) ?? null;
  const set = (custom: BuildingCustom) => {
    setDraft({ ...draft, ...custom });
    session.submit({ t: 'build.customize', id: b.id, custom });
  };
  const shop = !def?.housing && def?.category !== 'civic';
  const close = () => (session.ui.customize.value = null);
  const commitSign = () => {
    const text = sign.trim().slice(0, MAX_SIGN_CHARS);
    if ((value('sign') ?? '') === text) return;
    set({ sign: text || null });
  };

  return (
    <Frame
      id="customize"
      class="inspector-panel customize"
      icon="customize"
      kicker="A personal touch"
      title={def?.name ?? b.def}
      onClose={close}
    >
      <HouseSketch
        wall={swatchHex('wall', value('wall') as string, '#f1e6cf')}
        roof={swatchHex('roof', value('roof') as string, '#c0643e')}
        accent={swatchHex('accent', value('accent') as string, '#3f7f7a')}
        boxes={value('windowBoxes') === true}
        shutters={value('shutters') === true}
        chimney={value('chimney') !== false}
        sign={shop ? (value('sign') as string | null) : null}
      />
      <SwatchRow
        label="Walls"
        group="wall"
        swatches={groups.wall}
        current={value('wall') as string | null}
        onPick={(v) => set({ wall: v })}
      />
      <SwatchRow
        label="Roof"
        group="roof"
        swatches={groups.roof}
        current={value('roof') as string | null}
        onPick={(v) => set({ roof: v })}
      />
      <div class="material-row" role="radiogroup" aria-label="Roof material">
        {groups.roofMaterial.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={value('roofMaterial') === s.id}
            class={value('roofMaterial') === s.id ? 'active' : ''}
            data-testid={`material-${s.id}`}
            onClick={() => set({ roofMaterial: value('roofMaterial') === s.id ? null : s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <SwatchRow
        label="Door and trim"
        group="accent"
        swatches={groups.accent}
        current={value('accent') as string | null}
        onPick={(v) => set({ accent: v })}
      />
      <ModulePicker session={session} id={b.id} />
      <Heading>Details</Heading>
      <div class="detail-toggles">
        <Toggle
          on={value('windowBoxes') === true}
          label="Window boxes"
          testid="detail-windowBoxes"
          onChange={(on) => set({ windowBoxes: on })}
        />
        <Toggle
          on={value('shutters') === true}
          label="Shutters"
          testid="detail-shutters"
          onChange={(on) => set({ shutters: on })}
        />
        <Toggle
          on={value('chimney') !== false}
          label="Chimney"
          testid="detail-chimney"
          onChange={(on) => set({ chimney: on })}
        />
      </div>
      {shop && (
        <label class="sign-field">
          <span>Sign over the door</span>
          <input
            value={sign}
            maxLength={MAX_SIGN_CHARS}
            placeholder={signPlaceholder(b.def)}
            data-testid="sign-input"
            onInput={(e) => setSign((e.target as HTMLInputElement).value)}
            onBlur={commitSign}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSign();
            }}
          />
        </label>
      )}
      <div class="panel-actions">
        <button
          type="button"
          data-testid="customize-reset"
          onClick={() =>
            set({
              wall: null,
              roof: null,
              roofMaterial: null,
              accent: null,
              windowBoxes: null,
              shutters: null,
              chimney: null,
            })
          }
        >
          Back to plain
        </button>
        <button type="button" class="primary" onClick={close}>
          Lovely
        </button>
      </div>
    </Frame>
  );
}

function signPlaceholder(def: string): string {
  if (def === 'bakery') return 'The Warm Loaf';
  if (def === 'market-stall') return 'Fresh Today';
  return 'Something with character';
}

function SwatchRow({
  label,
  group,
  swatches,
  current,
  onPick,
}: {
  label: string;
  group: string;
  swatches: Swatch[];
  current: string | null;
  onPick: (id: string | null) => void;
}) {
  return (
    <div class="swatch-row">
      <span class="swatch-label">{label}</span>
      <div class="swatches" role="radiogroup" aria-label={label}>
        {swatches.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={current === s.id}
            title={s.label}
            class={`swatch ${current === s.id ? 'active' : ''}`}
            style={{ '--swatch': s.hex }}
            data-testid={`swatch-${group}-${s.id}`}
            onClick={() => onPick(current === s.id ? null : s.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** A little inked house that shows the choices at once, whatever the 3D kit can do yet. */
function HouseSketch(p: {
  wall: string;
  roof: string;
  accent: string;
  boxes: boolean;
  shutters: boolean;
  chimney: boolean;
  sign: string | null;
}) {
  return (
    <svg
      class="house-sketch"
      viewBox="0 0 200 110"
      role="img"
      aria-label="A sketch of the building with these choices"
    >
      <path d="M8 104c40-6 140-6 184 0" class="ground" />
      {p.chimney && (
        <g>
          <rect x="128" y="18" width="12" height="24" fill="#b9b1a3" />
          <path d="M134 14c-5-4 4-7-1-11" class="smoke" />
        </g>
      )}
      <rect x="50" y="52" width="100" height="50" fill={p.wall} />
      <path d="M40 56 100 16l60 40z" fill={p.roof} />
      <path d="M46 52h108" class="eave" />
      <path d="M90 102V76a10 10 0 0 1 20 0v26z" fill={p.accent} />
      <circle cx="106" cy="88" r="1.4" class="knob" />
      {[60, 124].map((x) => (
        <g key={x}>
          <rect x={x} y="64" width="16" height="16" rx="1.5" fill="#ffe2a0" />
          <path d={`M${x + 8} 64v16M${x} 72h16`} class="mullion" />
          {p.shutters && (
            <>
              <rect x={x - 6} y="63" width="5" height="18" fill={p.accent} />
              <rect x={x + 17} y="63" width="5" height="18" fill={p.accent} />
            </>
          )}
          {p.boxes && (
            <g>
              <rect x={x - 2} y="80" width="20" height="5" fill="#8a6448" />
              {[0, 5, 10, 15].map((dx, i) => (
                <circle
                  key={dx}
                  cx={x + 1 + dx}
                  cy="79"
                  r="2.4"
                  fill={['#e9707a', '#f2b8c6', '#e0b84a', '#e9707a'][i]}
                />
              ))}
            </g>
          )}
        </g>
      ))}
      {p.sign && (
        <g>
          <rect x="70" y="40" width="60" height="11" rx="2" fill="#fbf1dc" />
          <text x="100" y="48.5" text-anchor="middle" class="sign-text">
            {p.sign.slice(0, 18)}
          </text>
        </g>
      )}
    </svg>
  );
}

const SLOT_WORD: Record<string, string> = {
  roof: 'On the roof',
  front: 'At the front',
  side: 'To the side',
  top: 'On top',
  wall: 'Along the wall',
};

/** Where a slot sits on the little house outline, for the preview. */
const SLOT_SPOT: Record<string, [number, number]> = {
  roof: [60, 18],
  front: [60, 62],
  side: [100, 52],
  top: [60, 6],
  wall: [30, 52],
};

/**
 * I3 (C5F): modules (customization phase 2, C5C's content): one row per slot the building has,
 * each module with its cost, a dot on a sketch for where it goes, fitted with build.setModule.
 */
export function ModulePicker({ session, id }: { session: Session; id: number }) {
  const b = session.mirror.buildings.get(id);
  const def = b ? content.buildingById.get(b.def) : undefined;
  const detail = useInspect<BuildingDetail>((k, i) => session.inspect(k, i), 'building', id, b);
  const [hover, setHover] = useState<string | null>(null);
  const slots = def?.moduleSlots ?? [];
  if (!b || !slots.length) return null;
  const fitted = new Map(detail?.modules ?? []);
  return (
    <section class="module-picker" data-testid="module-picker">
      <Heading>Additions</Heading>
      <svg class="module-preview" viewBox="0 0 120 80" aria-hidden="true">
        <path
          d="M18 72 V40 L60 14 L102 40 V72 Z"
          fill="var(--paper-light)"
          stroke="var(--ink-line)"
          stroke-width="1.5"
        />
        <path d="M52 72 V54 h16 v18" fill="none" stroke="var(--ink-line)" stroke-width="1.2" />
        {slots.map(([slot]) => {
          const [x, y] = SLOT_SPOT[slot] ?? [60, 40];
          return (
            <circle
              key={slot}
              cx={x}
              cy={y}
              r={hover === slot ? 7 : 5}
              class={`slot-dot ${fitted.has(slot) ? 'fitted' : ''}`}
            />
          );
        })}
      </svg>
      {slots.map(([slot]) => {
        const options = content.modules.filter((md) => md.slot === slot);
        const now = fitted.get(slot) ?? null;
        return (
          <div
            key={slot}
            class="module-slot"
            data-testid={`slot-${slot}`}
            onMouseEnter={() => setHover(slot)}
            onMouseLeave={() => setHover(null)}
          >
            <span class="small muted">{SLOT_WORD[slot] ?? slot}</span>
            {options.length === 0 ? (
              <span class="small muted">Nothing to fit here yet.</span>
            ) : (
              <div class="material-row" role="radiogroup" aria-label={SLOT_WORD[slot] ?? slot}>
                {options.map((md) => (
                  <button
                    key={md.id}
                    type="button"
                    role="radio"
                    aria-checked={now === md.id}
                    class={now === md.id ? 'active' : ''}
                    data-testid={`module-${md.id}`}
                    title={costText(md.cost)}
                    onClick={() =>
                      session.submit({ t: 'build.setModule', id, slot, module: now === md.id ? null : md.id })
                    }
                  >
                    {md.name}
                    <span class="small muted"> {costText(md.cost)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function costText(cost?: { coins?: number; goods?: [string, number][] }): string {
  const parts: string[] = [];
  if (cost?.coins) parts.push(`${cost.coins} coins`);
  for (const [g, q] of cost?.goods ?? [])
    parts.push(`${q} ${content.goodById.get(g)?.label.toLowerCase() ?? g}`);
  return parts.length ? parts.join(', ') : 'free';
}
