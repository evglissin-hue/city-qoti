// Overlays (docs/spec/13-ledger.md, Reports and overlays; 17-presentation.md, Accessibility): ground-
// draped layers of their own, never edits to the terrain shader.
// - 'charm' and 'charm:<category>': a colorblind-safe ramp (viridis: dark violet to yellow, so
//   lightness alone tells low from high); noise reads the other way round (quiet is yellow).
// - 'coverage': well water circles (radius from content) colored by load against capacity, and
//   homes tinted by whether any well reaches them.
// - 'flows': animated chevrons along arcs between buildings, weighted by deliveries.
// - 'status': building status icons from BuildingStatus bits.
// - 'fields': each farmhouse's reach and the field tiles it tends.
// - C4E 'zones': zone tints (the zone's own token color) with every lot outlined, solid when built
//   on, dashed while it waits; 'traffic': road tiles by cart passes this hour against the road's
//   capacity; 'land': lots by desirability (land value) and charm elsewhere in zoned land; 'needs':
//   homes by how content their households are, ringed in their tier's color. All on the same
//   colorblind-safe ramp as charm, so lightness tells low from high.
// `highlight()` draws a soft disc and ring, or tinted tiles, for wish areas and pattern sites.
import { palette } from '@qoti/art';
import { content } from '@qoti/content';
import { drawDef } from '../defs';
import {
  BuildingStatus,
  CHUNK_SIZE,
  CHUNKS_PER_SIDE,
  footprintSize,
  MAP_SIZE,
  type LayerName,
  type Rect,
} from '@qoti/sim';
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  type Material,
} from 'three';
import type { Mirror } from '../../state/mirror';
import { drapeGrid, drapeOutline, drapeRing, drapeTiles, groundY, mergeDrapes, type Rgba } from '../drape';
import { iconAtlas, IconSprites, STATUS_ICONS } from '../icons';
import { buildingGeometry, footprintHeights } from '../kitGeometry';
import { levelY } from '../coords';
import type { LayerContext, RenderLayer } from './types';

export type HighlightArea =
  | { x: number; z: number; radius: number; tone?: 'hearth' | 'ledger' }
  | { tiles: [number, number][]; tone?: 'hearth' | 'ledger' }
  | null;

export interface OverlaysLayer extends RenderLayer {
  set(kind: string | null): void;
  highlight(area: HighlightArea): void;
  /** The overlay showing now. */
  readonly kind: string | null;
}

/** Viridis, sampled at five stops: perceptually even and safe for every common color vision. */
const VIRIDIS = [0x440154, 0x3b528b, 0x21918c, 0x5ec962, 0xfde725].map((h) => new Color(h));

export function ramp(t: number, out = new Color()): Color {
  const v = Math.min(1, Math.max(0, t)) * (VIRIDIS.length - 1);
  const i = Math.min(VIRIDIS.length - 2, Math.floor(v));
  return out.copy(VIRIDIS[i]!).lerp(VIRIDIS[i + 1]!, v - i);
}

const CHARM_LAYERS: Record<string, LayerName> = {
  charm: 'charm',
  nature: 'charmNature',
  comfort: 'charmComfort',
  light: 'charmLight',
  view: 'charmView',
  noise: 'charmNoise',
};

/** Status bits in the order of STATUS_ICONS. */
const STATUS_ORDER = [
  BuildingStatus.noWorkers,
  BuildingStatus.missingInput,
  BuildingStatus.outputFull,
  BuildingStatus.noRoad,
  BuildingStatus.noPorters,
  BuildingStatus.paused,
  BuildingStatus.disrepair,
  BuildingStatus.waitingMaterials,
  BuildingStatus.waitingBuilders,
  BuildingStatus.noTrees,
  BuildingStatus.noFields,
];
/** Which statuses to show first when a building has several (blockers before warnings). */
const STATUS_PRIORITY = [3, 6, 0, 1, 8, 7, 4, 2, 9, 10, 5];

const TONES = { hearth: new Color(palette.hearth), ledger: new Color(palette.ledger) };

/** C4E: zone overlay tints by the zone def's token (docs/spec/13-ledger.md, Zoning and growth). */
const ZONE_TOKENS: Record<string, number> = {
  rose: 0xe0868c,
  plum: 0x9a6aa6,
  teal: 0x3f9f9a,
  ochre: 0xd9a33e,
  moss: 0x7f9a52,
};

/** C4E: tier colors for the needs overlay's rings, in TIERS order. */
const TIER_TONES: Record<string, number> = {
  settler: 0x8a6f58,
  craftsfolk: 0x3f7f7a,
  merchant: 0x7a5468,
  patron: 0xd6a73e,
};

function zoneColor(value: number): Color | null {
  const z = content.zoneByValue.get(value);
  return z ? new Color(ZONE_TOKENS[z.token] ?? 0x9a9a92) : null;
}

/** Logistics flows: a live view when the Mirror has one, otherwise an estimate from runtimes. */
export function flowsOf(mirror: Mirror): [from: number, to: number, units: number][] {
  const live = (mirror as unknown as { flows?: { value?: [number, number, number][] } }).flows?.value;
  if (live && live.length > 0) return live;
  const stores = [...mirror.buildings.values()].filter((b) => drawDef(b.def)?.tags?.includes('storehouse'));
  if (stores.length === 0) return [];
  const center = (id: number): [number, number] => {
    const b = mirror.buildings.get(id)!;
    const def = drawDef(b.def);
    const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
    return [b.x + w / 2, b.z + d / 2];
  };
  const nearest = (id: number): number => {
    const [x, z] = center(id);
    let best = stores[0]!.id;
    let bd = Infinity;
    for (const s of stores) {
      const [sx, sz] = center(s.id);
      const d = (sx - x) ** 2 + (sz - z) ** 2;
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    return best;
  };
  const flows: [number, number, number][] = [];
  for (const b of mirror.buildings.values()) {
    const def = drawDef(b.def);
    if (!b.rt || !def || def.tags?.includes('storehouse')) continue;
    const store = nearest(b.id);
    const out = b.rt.output.reduce((t, [, q]) => t + q, 0);
    if (out > 0) flows.push([b.id, store, out]);
    const inputs = def.methods?.[0]?.inputs.reduce((t, [, q]) => t + q, 0) ?? 0;
    if (inputs > 0) flows.push([store, b.id, inputs * 2]);
    const needs = b.rt.construction?.needs.reduce((t, [, q]) => t + q, 0) ?? 0;
    if (needs > 0) flows.push([store, b.id, needs]);
    if (def.tags?.includes('outlet')) flows.push([store, b.id, 8]);
  }
  return flows;
}

const FLOW_VERTEX = /* glsl */ `
attribute float along;
attribute float side;
attribute float weight;
varying float vAlong;
varying float vSide;
varying float vWeight;
void main() {
  vAlong = along;
  vSide = side;
  vWeight = weight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FLOW_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying float vAlong;
varying float vSide;
varying float vWeight;
void main() {
  // Chevrons marching from source to destination: a V across the ribbon in each repeat.
  float u = fract(vAlong * 1.6 - uTime * 0.9);
  float v = abs(vSide);
  float d = u - v * 0.45;
  float chevron = step(0.0, d) * step(d, 0.32);
  float edge = smoothstep(1.0, 0.75, v);
  float a = (0.28 + chevron * 0.72) * edge;
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.97, 0.88), chevron * 0.35), a * 0.92);
  #include <colorspace_fragment>
}
`;

export function overlaysLayer(): OverlaysLayer {
  let ctx: LayerContext | null = null;
  let kind: string | null = null;
  const group = new Group();
  group.renderOrder = 4;
  const sheet = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: DoubleSide,
  });
  const flowMaterial = new ShaderMaterial({
    vertexShader: FLOW_VERTEX,
    fragmentShader: FLOW_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(palette.ledger).lerp(new Color(0x7fd4a8), 0.35) },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const hlMaterial = sheet.clone();
  let status: IconSprites | null = null;
  const charmChunks: (Mesh | null)[] = new Array<Mesh | null>(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE).fill(null);
  const dirtyCharm = new Set<number>();
  let highlightGroup: Group | null = null;
  let highlightArea: HighlightArea = null;
  let time = 0;
  let statusRebuild = false;

  function add(geometry: BufferGeometry, material: Material = sheet, parent: Group = group): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 4;
    mesh.userData.noCast = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }

  // C4E: the village overlays draw one sheet per lot or home; they are gathered and merged into a
  // single mesh, so a town of 150 homes costs one draw rather than 300.
  let gathered: BufferGeometry[] = [];

  /** Queues a sheet for the merged mesh; `under` puts it beneath the sheets queued so far. */
  function put(geometry: BufferGeometry, under = false): void {
    if (under) gathered.unshift(geometry);
    else gathered.push(geometry);
  }

  function merged(build: () => void): void {
    gathered = [];
    build();
    if (gathered.length > 0) add(mergeDrapes(gathered));
    gathered = [];
  }

  function clear(): void {
    for (const c of [...group.children]) {
      group.remove(c);
      (c as Mesh).geometry?.dispose();
    }
    charmChunks.fill(null);
    dirtyCharm.clear();
  }

  // --- Charm -----------------------------------------------------------------------------------------

  function charmLayer(): LayerName {
    const cat = kind?.startsWith('charm:') ? kind.slice(6) : 'charm';
    return CHARM_LAYERS[cat] ?? 'charm';
  }

  function charmChunk(i: number): void {
    if (!ctx) return;
    const m = ctx.mirror;
    const layer = charmLayer();
    const noise = layer === 'charmNoise';
    const cx = (i % CHUNKS_PER_SIDE) * CHUNK_SIZE;
    const cz = Math.floor(i / CHUNKS_PER_SIDE) * CHUNK_SIZE;
    const c = new Color();
    const tileValue = (x: number, z: number): number => {
      const tx = Math.min(MAP_SIZE - 1, Math.max(0, x));
      const tz = Math.min(MAP_SIZE - 1, Math.max(0, z));
      return m.water(tx, tz) ? -1 : m.charm(tx, tz, layer);
    };
    const g = drapeGrid(m, cx, cz, cx + CHUNK_SIZE, cz + CHUNK_SIZE, (x, z): Rgba => {
      let sum = 0;
      let n = 0;
      for (const [dx, dz] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ] as const) {
        const v = tileValue(x + dx, z + dz);
        if (v < 0) continue;
        sum += v;
        n++;
      }
      if (n === 0) return [0, 0, 0, 0];
      const t = sum / n / 100;
      ramp(noise ? 1 - t : t, c);
      return [c.r, c.g, c.b, 0.66];
    });
    const old = charmChunks[i];
    if (old) {
      group.remove(old);
      old.geometry.dispose();
    }
    charmChunks[i] = add(g);
  }

  function markCharm(rect: Rect): void {
    const x0 = Math.max(0, Math.floor((rect[0] - 1) / CHUNK_SIZE));
    const z0 = Math.max(0, Math.floor((rect[1] - 1) / CHUNK_SIZE));
    const x1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((rect[2] + 1) / CHUNK_SIZE));
    const z1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((rect[3] + 1) / CHUNK_SIZE));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) dirtyCharm.add(z * CHUNKS_PER_SIDE + x);
  }

  // --- Coverage, fields, flows, status ----------------------------------------------------------------

  function centerOf(id: number): [number, number, number] | null {
    const b = ctx?.mirror.buildings.get(id);
    if (!b || !ctx) return null;
    const def = drawDef(b.def);
    const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
    const [, hi] = footprintHeights(ctx.mirror, b.def, b.x, b.z, b.rot);
    return [b.x + w / 2, levelY(hi), b.z + d / 2];
  }

  function coverage(): void {
    if (!ctx) return;
    const m = ctx.mirror;
    const homes = [...m.buildings.values()].filter((b) => drawDef(b.def)?.tags?.includes('home'));
    const residentsAt = new Map<number, number>();
    for (const r of m.residents.values()) residentsAt.set(r.homeId, (residentsAt.get(r.homeId) ?? 0) + 1);
    const covered = new Set<number>();
    for (const b of m.buildings.values()) {
      const cov = drawDef(b.def)?.coverage?.find((x) => x.kind === 'water');
      if (!cov) continue;
      const c = centerOf(b.id);
      if (!c) continue;
      const [cx, , cz] = c;
      let served = 0;
      for (const h of homes) {
        const hc = centerOf(h.id);
        if (!hc || (hc[0] - cx) ** 2 + (hc[2] - cz) ** 2 > cov.radius * cov.radius) continue;
        covered.add(h.id);
        served += residentsAt.get(h.id) ?? 0;
      }
      const load = cov.capacity ? served / cov.capacity : 0;
      const tint = new Color(load > 1 ? palette.warning : 0x4f9fd0);
      const r = cov.radius;
      add(
        drapeGrid(
          m,
          Math.floor(cx - r - 1),
          Math.floor(cz - r - 1),
          Math.ceil(cx + r + 1),
          Math.ceil(cz + r + 1),
          (x, z) => {
            const d = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
            const a = d > r ? 0 : 0.16 + 0.14 * (d / r) ** 3;
            return [tint.r, tint.g, tint.b, a];
          },
        ),
      );
      add(drapeRing(m, cx, cz, r, 0.16, [tint.r, tint.g, tint.b, 0.9]));
      // A load gauge: an arc inside the ring, filled by served over capacity.
      if (cov.capacity) {
        const frac = Math.min(1, load);
        const g = drapeRing(m, cx, cz, r - 0.35, 0.22, [1, 1, 1, 0.85]);
        const idx = g.getIndex()!;
        g.setIndex(Array.from(idx.array).slice(0, Math.floor((idx.count / 6) * frac) * 6));
        add(g);
      }
    }
    for (const h of homes) {
      const def = drawDef(h.def);
      const [w, d] = def ? footprintSize(def, h.rot) : [1, 1];
      const ok = covered.has(h.id);
      const c = new Color(ok ? 0x4f9fd0 : palette.danger);
      add(drapeGrid(m, h.x, h.z, h.x + w, h.z + d, () => [c.r, c.g, c.b, ok ? 0.35 : 0.55], 0.06));
    }
  }

  function fields(): void {
    if (!ctx) return;
    const m = ctx.mirror;
    const owner = m.layers.fieldOwner as Int32Array | undefined;
    const gold = new Color(palette.mustard);
    if (owner) {
      let x0 = MAP_SIZE;
      let z0 = MAP_SIZE;
      let x1 = 0;
      let z1 = 0;
      for (let i = 0; i < owner.length; i++) {
        if (!owner[i]) continue;
        const x = i % MAP_SIZE;
        const z = Math.floor(i / MAP_SIZE);
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x + 1);
        z1 = Math.max(z1, z + 1);
      }
      if (x1 > x0) {
        add(
          drapeGrid(m, x0, z0, x1, z1, (x, z) => {
            let n = 0;
            for (const [dx, dz] of [
              [-1, -1],
              [0, -1],
              [-1, 0],
              [0, 0],
            ] as const) {
              const tx = x + dx;
              const tz = z + dz;
              if (tx >= 0 && tz >= 0 && tx < MAP_SIZE && tz < MAP_SIZE && owner[tz * MAP_SIZE + tx]) n++;
            }
            return [gold.r, gold.g, gold.b, n === 0 ? 0 : 0.2 + n * 0.08];
          }),
        );
      }
    }
    for (const b of m.buildings.values()) {
      const def = drawDef(b.def);
      const range = def?.methods?.find((x) => x.kind === 'farm')?.range;
      if (!range) continue;
      const c = centerOf(b.id);
      if (c) add(drapeRing(m, c[0], c[2], range, 0.14, [gold.r, gold.g, gold.b, 0.95], undefined, 3));
    }
  }

  function flows(): void {
    if (!ctx) return;
    const list = flowsOf(ctx.mirror);
    const pos: number[] = [];
    const along: number[] = [];
    const side: number[] = [];
    const weight: number[] = [];
    const idx: number[] = [];
    const max = Math.max(1, ...list.map(([, , u]) => u));
    for (const [from, to, units] of list) {
      const a = centerOf(from);
      const b = centerOf(to);
      if (!a || !b || from === to) continue;
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.5) continue;
      const w = 0.12 + 0.28 * Math.sqrt(units / max);
      const nx = -dz / len;
      const nz = dx / len;
      const seg = Math.max(8, Math.round(len * 2));
      const base = pos.length / 3;
      const lift = 0.5 + len * 0.06;
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const x = a[0] + dx * t;
        const z = a[2] + dz * t;
        const y =
          Math.max(groundY(ctx.mirror, x, z), a[1] + (b[1] - a[1]) * t) + 0.15 + Math.sin(t * Math.PI) * lift;
        for (const s of [-1, 1]) {
          pos.push(x + nx * w * s, y, z + nz * w * s);
          along.push(t * len);
          side.push(s);
          weight.push(units / max);
        }
        if (i < seg) {
          const k = base + i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
    if (idx.length === 0) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('along', new Float32BufferAttribute(along, 1));
    g.setAttribute('side', new Float32BufferAttribute(side, 1));
    g.setAttribute('weight', new Float32BufferAttribute(weight, 1));
    g.setIndex(idx);
    const mesh = add(g, flowMaterial);
    mesh.renderOrder = 6;
  }

  function statusIcons(): void {
    if (!ctx || !status) return;
    status.begin(time);
    if (kind === 'status') {
      for (const b of ctx.mirror.buildings.values()) {
        const bits = b.rt?.status ?? 0;
        if (!bits) continue;
        const shown = STATUS_PRIORITY.filter((i) => bits & STATUS_ORDER[i]!).slice(0, 2);
        const c = centerOf(b.id);
        if (!c) continue;
        const top = buildingGeometry(b.def).boundingBox?.max.y ?? 1;
        shown.forEach((icon, k) => {
          const off = (k - (shown.length - 1) / 2) * 0.62;
          status!.push(c[0] + off, c[1] + top + 0.25, c[2], icon, b.id + k);
        });
      }
    }
    status.end();
  }

  // --- C4E: zones and lots, traffic, land value, needs by tier -----------------------------------

  /** The bounding rect of tiles where `test` holds, or null. */
  function bounds(test: (i: number) => boolean): [number, number, number, number] | null {
    let x0 = MAP_SIZE;
    let z0 = MAP_SIZE;
    let x1 = -1;
    let z1 = -1;
    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
      if (!test(i)) continue;
      const x = i % MAP_SIZE;
      const z = Math.floor(i / MAP_SIZE);
      if (x < x0) x0 = x;
      if (z < z0) z0 = z;
      if (x > x1) x1 = x;
      if (z > z1) z1 = z;
    }
    return x1 < 0 ? null : [x0, z0, x1 + 1, z1 + 1];
  }

  function zones(): void {
    if (!ctx) return;
    const m = ctx.mirror;
    const zl = m.layers.zone as Uint8Array;
    const box = bounds((i) => zl[i]! > 0);
    if (box) {
      const colors = new Map<number, Color | null>();
      const colorOf = (v: number): Color | null => {
        if (!colors.has(v)) colors.set(v, zoneColor(v));
        return colors.get(v)!;
      };
      put(
        drapeGrid(m, box[0], box[1], box[2], box[3], (x, z): Rgba => {
          // Average the zoned tiles round this corner, so tints meet softly at zone borders.
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (const [dx, dz] of [
            [-1, -1],
            [0, -1],
            [-1, 0],
            [0, 0],
          ] as const) {
            const tx = x + dx;
            const tz = z + dz;
            if (tx < 0 || tz < 0 || tx >= MAP_SIZE || tz >= MAP_SIZE) continue;
            const c = colorOf(zl[tz * MAP_SIZE + tx]!);
            if (!c) continue;
            r += c.r;
            g += c.g;
            b += c.b;
            n++;
          }
          return n === 0 ? [0, 0, 0, 0] : [r / n, g / n, b / n, 0.14 + n * 0.07];
        }),
      );
    }
    // Lot outlines in a deeper shade of their zone: solid when built on, dashed while waiting.
    for (const lot of m.lots.values()) {
      const z = content.zoneById.get(lot.zone);
      const c = new Color(ZONE_TOKENS[z?.token ?? ''] ?? 0x9a9a92).multiplyScalar(0.62);
      put(
        drapeOutline(
          m,
          lot.x,
          lot.z,
          lot.x + lot.w,
          lot.z + lot.d,
          0.07,
          [c.r, c.g, c.b, 0.95],
          0.07,
          lot.buildingId ? 0 : 2,
        ),
      );
    }
  }

  function traffic(): void {
    if (!ctx) return;
    const m = ctx.mirror;
    const tl = m.layers.traffic as Uint8Array;
    const rl = m.layers.road as Uint8Array;
    const capacity = new Map(content.roads.map((r) => [r.layerValue, r.capacity ?? 0]));
    const tiles: { x: number; z: number; rgba: Rgba }[] = [];
    const c = new Color();
    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
      const road = rl[i]!;
      if (!road) continue;
      const cap = capacity.get(road) ?? 0;
      const passes = tl[i]!;
      // Paths carry no carts: shown faintly, so the cart network stands out.
      if (cap <= 0) {
        if (passes === 0) continue;
      }
      const load = cap > 0 ? passes / cap : 0;
      ramp(Math.min(1, load * 0.75 + (passes > 0 ? 0.12 : 0)), c);
      tiles.push({
        x: i % MAP_SIZE,
        z: Math.floor(i / MAP_SIZE),
        rgba: [c.r, c.g, c.b, cap > 0 ? 0.78 : 0.4],
      });
    }
    if (tiles.length > 0) put(drapeTiles(m, tiles, 0.04));
  }

  function land(): void {
    if (!ctx) return;
    const m = ctx.mirror;
    const tiles: { x: number; z: number; rgba: Rgba }[] = [];
    const c = new Color();
    const inLot = new Set<number>();
    for (const lot of m.lots.values()) {
      ramp(lot.desirability / 100, c);
      for (let z = lot.z; z < lot.z + lot.d; z++)
        for (let x = lot.x; x < lot.x + lot.w; x++) {
          inLot.add(z * MAP_SIZE + x);
          tiles.push({ x, z, rgba: [c.r, c.g, c.b, 0.72] });
        }
      put(
        drapeOutline(
          m,
          lot.x,
          lot.z,
          lot.x + lot.w,
          lot.z + lot.d,
          0.05,
          [c.r * 0.6, c.g * 0.6, c.b * 0.6, 0.9],
          0.05,
        ),
      );
    }
    // Zoned land not cut into lots yet shows its charm, the main thing that will make it valuable.
    const zl = m.layers.zone as Uint8Array;
    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
      if (!zl[i] || inLot.has(i)) continue;
      const x = i % MAP_SIZE;
      const z = Math.floor(i / MAP_SIZE);
      ramp(m.charm(x, z) / 100, c);
      tiles.push({ x, z, rgba: [c.r, c.g, c.b, 0.45] });
    }
    if (tiles.length > 0) put(drapeTiles(m, tiles, 0.0), true);
  }

  function needs(): void {
    if (!ctx) return;
    const m = ctx.mirror;
    const moods = new Map<number, { sum: number; n: number }>();
    for (const r of m.residents.values()) {
      if (!r.homeId) continue;
      const e = moods.get(r.homeId) ?? { sum: 0, n: 0 };
      e.sum += r.moodBand;
      e.n++;
      moods.set(r.homeId, e);
    }
    const tierOf = new Map<number, string>();
    for (const h of m.households.values()) if (h.homeId) tierOf.set(h.homeId, h.tier);
    const c = new Color();
    for (const b of m.buildings.values()) {
      const def = drawDef(b.def);
      if (!def?.housing && !def?.tags?.includes('home')) continue;
      const [w, d] = footprintSize(def, b.rot);
      const e = moods.get(b.id);
      const tier = tierOf.get(b.id);
      if (!e && !tier) {
        // Empty homes: a pale dashed outline just outside the walls.
        put(drapeOutline(m, b.x, b.z, b.x + w, b.z + d, 0.08, [0.9, 0.88, 0.82, 0.8], -0.3, 2));
        continue;
      }
      // Mood as a pool of color that spills a tile past the walls and fades, so it reads round the
      // house rather than hiding under it; the tier is a ring just outside the walls.
      ramp(e ? e.sum / e.n / 4 : 0.5, c);
      const x0 = b.x - 1;
      const z0 = b.z - 1;
      const x1 = b.x + w + 1;
      const z1 = b.z + d + 1;
      put(
        drapeGrid(
          m,
          x0,
          z0,
          x1,
          z1,
          (x, z): Rgba => {
            const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
            return [c.r, c.g, c.b, edge <= 0 ? 0 : edge < 1 ? 0.32 : 0.62];
          },
          0.07,
          0.5,
        ),
      );
      const t = new Color(TIER_TONES[tier ?? 'settler'] ?? TIER_TONES.settler!);
      put(drapeOutline(m, b.x, b.z, b.x + w, b.z + d, 0.16, [t.r, t.g, t.b, 0.95], -0.32));
    }
  }

  function rebuild(): void {
    if (!ctx) return;
    clear();
    if (kind === 'charm' || kind?.startsWith('charm:')) {
      for (let i = 0; i < charmChunks.length; i++) dirtyCharm.add(i);
    } else if (kind === 'coverage') coverage();
    else if (kind === 'fields') fields();
    else if (kind === 'flows') flows();
    else if (kind === 'zones') merged(zones);
    else if (kind === 'traffic') merged(traffic);
    else if (kind === 'land') merged(land);
    else if (kind === 'needs') merged(needs);
    statusRebuild = true;
    ctx.invalidate();
  }

  // --- Highlight -------------------------------------------------------------------------------------

  function drawHighlight(): void {
    if (!ctx) return;
    if (highlightGroup) {
      for (const c of [...highlightGroup.children]) (c as Mesh).geometry.dispose();
      highlightGroup.removeFromParent();
      highlightGroup = null;
    }
    const area = highlightArea;
    if (!area) return;
    const tone = TONES[area.tone ?? 'hearth'];
    const g = new Group();
    g.renderOrder = 5;
    const m = ctx.mirror;
    if ('tiles' in area) {
      const set = new Set(area.tiles.map(([x, z]) => z * MAP_SIZE + x));
      let x0 = MAP_SIZE;
      let z0 = MAP_SIZE;
      let x1 = 0;
      let z1 = 0;
      for (const [x, z] of area.tiles) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x + 1);
        z1 = Math.max(z1, z + 1);
      }
      if (x1 > x0) {
        add(
          drapeGrid(
            m,
            x0,
            z0,
            x1,
            z1,
            (x, z) => {
              let n = 0;
              for (const [dx, dz] of [
                [-1, -1],
                [0, -1],
                [-1, 0],
                [0, 0],
              ] as const)
                if (set.has((z + dz) * MAP_SIZE + x + dx)) n++;
              return [tone.r, tone.g, tone.b, n === 0 ? 0 : 0.12 + n * 0.07];
            },
            0.06,
          ),
          hlMaterial,
          g,
        );
      }
    } else {
      const { x, z, radius } = area;
      const cx = x + 0.5;
      const cz = z + 0.5;
      add(
        drapeGrid(
          m,
          Math.floor(cx - radius - 1),
          Math.floor(cz - radius - 1),
          Math.ceil(cx + radius + 1),
          Math.ceil(cz + radius + 1),
          (px, pz) => {
            const d = Math.sqrt((px - cx) ** 2 + (pz - cz) ** 2) / radius;
            return [tone.r, tone.g, tone.b, d > 1 ? 0 : 0.05 + 0.17 * d * d * d];
          },
          0.06,
        ),
        hlMaterial,
        g,
      );
      add(drapeRing(m, cx, cz, radius, 0.08, [tone.r, tone.g, tone.b, 0.6], 0.08, 3), hlMaterial, g);
    }
    ctx.scene.add(g);
    highlightGroup = g;
    ctx.invalidate();
  }

  return {
    id: 'overlays',
    get kind() {
      return kind;
    },
    init(c) {
      ctx = c;
      c.scene.add(group);
      status = new IconSprites(c.scene, iconAtlas(STATUS_ICONS), STATUS_ICONS.length, 0.62);
      status.setDim(0.95);
    },
    update(change) {
      if (!kind) {
        if (highlightArea && (change.full || change.rects.has('height'))) drawHighlight();
        return;
      }
      if (kind === 'charm' || kind.startsWith('charm:')) {
        const layer = charmLayer();
        for (const r of change.rects.get(layer) ?? []) markCharm(r);
        for (const r of change.rects.get('height') ?? []) markCharm(r);
        if (change.full) rebuild();
      } else if (
        change.full ||
        change.buildings ||
        change.residents ||
        change.rects.has('fieldOwner') ||
        // C4E: the village overlays follow zones, lots, traffic and households too.
        (change.village && (kind === 'zones' || kind === 'land')) ||
        (change.households && kind === 'needs') ||
        ((change.rects.has('zone') || change.rects.has('lot')) && (kind === 'zones' || kind === 'land')) ||
        ((change.rects.has('traffic') || change.rects.has('road')) && kind === 'traffic')
      ) {
        rebuild();
      }
      if (change.buildings) statusRebuild = true;
      if (highlightArea && (change.full || change.rects.has('height'))) drawHighlight();
    },
    frame(dt) {
      time += dt;
      let dirty = false;
      if (dirtyCharm.size > 0 && ctx) {
        // Spread the work over frames, nearest chunks to the camera first.
        const cam = ctx.camera.position;
        const order = [...dirtyCharm].sort((a, b) => {
          const da =
            ((a % CHUNKS_PER_SIDE) * CHUNK_SIZE - cam.x) ** 2 +
            (Math.floor(a / CHUNKS_PER_SIDE) * CHUNK_SIZE - cam.z) ** 2;
          const db =
            ((b % CHUNKS_PER_SIDE) * CHUNK_SIZE - cam.x) ** 2 +
            (Math.floor(b / CHUNKS_PER_SIDE) * CHUNK_SIZE - cam.z) ** 2;
          return da - db;
        });
        for (const i of order.slice(0, 12)) {
          dirtyCharm.delete(i);
          charmChunk(i);
        }
        dirty = true;
      }
      if (statusRebuild || kind === 'status') {
        statusRebuild = false;
        statusIcons();
        dirty = dirty || kind === 'status';
      }
      if (kind === 'flows') {
        (flowMaterial.uniforms.uTime as { value: number }).value = time;
        dirty = true;
      }
      if (highlightGroup) {
        // A slow, gentle breathing so the area is noticed without flashing.
        hlMaterial.opacity = 0.62 + Math.sin(time * 1.6) * 0.14;
        dirty = true;
      }
      return dirty;
    },
    set(k) {
      if (k === kind) return;
      kind = k;
      rebuild();
    },
    highlight(area) {
      highlightArea = area;
      drawHighlight();
    },
    dispose() {
      clear();
      group.removeFromParent();
      drawHighlight();
      status?.dispose();
      sheet.dispose();
      hlMaterial.dispose();
      flowMaterial.dispose();
    },
  };
}
