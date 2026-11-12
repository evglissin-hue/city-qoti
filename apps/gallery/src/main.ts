// Style kit gallery: every kit with seed, stage, level of detail and swatch sliders, a day and
// night slider and a turntable. URL params (?kit=cottage&seed=3&night=1&spin=0) fix a view for
// screenshots. C3D-1: ?set=trees lines up every forest tree at each growth stage plus its low
// detail version; ?set=nature lines up the scattered nature props in two variants each.
import {
  artKitId,
  constructionGeometry,
  createPatternArray,
  isRowKit,
  createResidentMaterial,
  kitById,
  kits,
  kitSurfaceUniforms,
  palette,
  patchKitShader,
  setKitMaterialHooks,
  SPECIES_IDS,
  type KitBuildOptions,
  type Season,
} from '@qoti/art';
import { content } from '@qoti/content';
import type { BufferGeometry } from 'three';
import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeFigure, type Figure } from './figures';
import { buildSeasons, SEASON_NAMES } from './seasons';
import { buildSurfaces, SURFACE_ORDER } from './surfaces';
import { buildTrades } from './trades';

const q = new URLSearchParams(location.search);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const hemi = new HemisphereLight(0xdde8f0, 0x7a8f5a, 1.1);
scene.add(hemi);
const sun = new DirectionalLight(0xfff4e0, 1.8);
sun.position.set(4, 6, 3);
scene.add(sun);
const ground = new Mesh(
  new PlaneGeometry(60, 60),
  new MeshStandardMaterial({ color: palette.grass, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// V1A: the game's lean kit material (Lambert, the pattern array by surface id, glass and water
// glint), with the gallery's own night glow: window panes and flames blend toward window light.
const kitUniforms = kitSurfaceUniforms(createPatternArray());
kitUniforms.uPat.value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const material = new MeshLambertMaterial({ vertexColors: true });
material.userData.kitUniforms = kitUniforms;
material.onBeforeCompile = (shader) => {
  patchKitShader(shader, kitUniforms);
  shader.uniforms.uNight = nightUniform;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = min(glow, 1.0);');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * vGlow * uNight * 1.4 + qKitGlint(vGlow * uNight);',
    );
};
material.customProgramCacheKey = () => 'gallery-lean-kit';
const seasonParam = (q.get('season') ?? 'spring') as Season;
setKitMaterialHooks(material, { season: seasonParam, snow: seasonParam === 'winter' ? 1 : 0, sway: 1 });
const nightUniform = { value: 0 };

const holder = new Group();
scene.add(holder);
const parts: { mesh: Mesh; speed: number }[] = [];
const residentMaterial = createResidentMaterial();
const residentTime = residentMaterial.userData.time as { value: number };
/** Figures on show with their animation (AgentAnim number) and walk speed in cycles per second. */
const figures: { fig: Figure; anim: number; speed: number; phase: number; hold?: number }[] = [];
const sceneName = q.get('scene') ?? 'kit';
const animParam = q.get('anim');

const state = {
  kit: q.get('kit') ?? 'cottage',
  seed: Number(q.get('seed') ?? 1),
  stage: 3,
  lod: 'high' as 'high' | 'low',
  wall: -1,
  roof: -1,
  night: Number(q.get('night') ?? 0),
  spin: q.get('spin') !== '0',
  set: q.get('set') ?? '',
};

function sizeOf(id: string): { size: [number, number]; entrance: [number, number] } | null {
  const def = content.buildings.find((b) => artKitId(b.art) === id);
  if (def) return { size: def.size, entrance: def.entrance };
  // C4E: kits whose defs are not in content yet carry the footprint they are drawn for.
  const fp = kitById.get(id)?.footprint;
  return fp ? { size: fp.size, entrance: fp.entrance } : null;
}

/** C4E: a kit id with an optional footprint, 'cottage@3x2' (entrance in the front row, middle). */
function kitAndSize(spec: string): {
  id: string;
  fp: { size: [number, number]; entrance: [number, number] } | null;
} {
  const [id = '', size] = spec.split('@');
  if (!size) return { id, fp: sizeOf(id) };
  const [w = 2, d = 2] = size.split('x').map(Number);
  return { id, fp: { size: [w, d], entrance: [Math.floor(w / 2), d - 1] } };
}

/** C3D-1 lineups: trees by stage (and low detail, far right), or nature props by variant. */
function lineup(set: string): boolean {
  if (set === 'trees') {
    // V1C: each tree at both levels: stages 0 to 3 near, then stages 1 and 3 far, and a hedgerow
    // row; the label gives the triangles of a mature tree at each level.
    const counts: string[] = [];
    ['oak', 'birch', 'pine', 'hedgerow'].forEach((id, row) => {
      const kit = kitById.get(id)!;
      const opts: KitBuildOptions[] =
        id === 'hedgerow'
          ? [{ seed: state.seed }, { seed: state.seed, lod: 'low' }]
          : [0, 1, 2, 3].map((stage) => ({ stage, seed: state.seed }));
      if (id !== 'hedgerow')
        opts.push({ stage: 1, seed: state.seed, lod: 'low' }, { stage: 3, seed: state.seed, lod: 'low' });
      const tris = (o: KitBuildOptions) => kit.build(o).getAttribute('position').count / 3;
      counts.push(`${id} ${tris({ seed: state.seed })}/${tris({ seed: state.seed, lod: 'low' })}`);
      opts.forEach((o, col) => {
        const mesh = new Mesh(kit.build(o), material);
        mesh.position.set((col - 2.5) * 1.3, 0, (row - 1.5) * 1.4);
        holder.add(mesh);
      });
    });
    info.textContent = `trees: stages 0 to 3, then far at 1 and 3 (triangles near/far: ${counts.join(', ')})`;
    return true;
  }
  if (set === 'nature') {
    const nature = kits.filter((k) => k.kind === 'nature');
    nature.forEach((kit, i) => {
      // V1C: two variants near, and a third row at the far level.
      for (let v = 0; v < 3; v++) {
        const opts: KitBuildOptions =
          v < 2 ? { seed: state.seed + v * 13 } : { seed: state.seed, lod: 'low' };
        const mesh = new Mesh(kit.build(opts), material);
        mesh.scale.setScalar(2.4);
        mesh.position.set((i - (nature.length - 1) / 2) * 1.35, 0, (v - 1) * 1.6);
        holder.add(mesh);
      }
    });
    info.textContent = `nature: ${nature.map((k) => k.id).join(', ')}`;
    return true;
  }
  return false;
}

function rebuild(): void {
  for (const c of [...holder.children]) {
    holder.remove(c);
    ((c as Mesh).geometry as BufferGeometry | undefined)?.dispose();
  }
  parts.length = 0;
  if (state.set && lineup(state.set)) return;
  const kit = kitById.get(state.kit);
  if (!kit) return;
  const fp = sizeOf(state.kit);
  const opts: KitBuildOptions = {
    seed: state.seed,
    stage: state.stage,
    lod: state.lod,
    ...(fp ?? {}),
    params: {
      ...(state.wall >= 0 ? { wall: state.wall } : {}),
      ...(state.roof >= 0 ? { roof: state.roof } : {}),
    },
  };
  const off: [number, number] = fp ? [-fp.size[0] / 2, -fp.size[1] / 2] : [0, 0];
  const mesh = new Mesh(kit.build(opts), material);
  mesh.position.set(off[0], 0, off[1]);
  holder.add(mesh);
  for (const p of kit.parts?.(opts) ?? []) {
    const pg = p.geometry.clone().translate(-p.pivot[0], -p.pivot[1], -p.pivot[2]);
    const pm = new Mesh(pg, material);
    pm.position.set(off[0] + p.pivot[0], p.pivot[1], off[1] + p.pivot[2]);
    holder.add(pm);
    parts.push({ mesh: pm, speed: p.spinSpeed ?? 0 });
  }
  info.textContent = `${kit.id}: ${mesh.geometry.getAttribute('position').count / 3} triangles`;
}

/**
 * Several kits side by side (?scene=lineup&kits=cottage,house&seeds=1,2&params=wall:rose;roof:slate).
 * Buildings stand on their footprints with a little gap; decor sits in a row in front.
 */
let lineupWidth = 4;
function buildLineup(): Group {
  for (const c of [...holder.children]) holder.remove(c);
  const ids = (q.get('kits') ?? 'cottage').split(',');
  const seeds = (q.get('seeds') ?? '').split(',').map(Number);
  const params: Record<string, string | number | boolean> = {};
  for (const kv of (q.get('params') ?? '').split(';').filter(Boolean)) {
    const i = kv.lastIndexOf(':');
    const k = kv.slice(0, i);
    const v = kv.slice(i + 1);
    if (i <= 0) continue;
    params[k] = v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v;
  }
  const row = new Group();
  let x = 0;
  // V1B: &join=1 stands the buildings side by side on one frontage and joins row kits into a row.
  const join = q.get('join') === '1';
  const kitOf = (k: number): string => kitAndSize(ids[k] ?? '').id;
  ids.forEach((id, i) => {
    // site:<kit>:<stage> shows a construction site for that kit.
    if (id.startsWith('site:')) {
      const [, kitId = 'cottage', stage = '0'] = id.split(':');
      const sfp = sizeOf(kitId) ?? { size: [2, 2] as [number, number] };
      const delivered = { logs: 2, planks: 3, stone: 2 };
      const site = new Mesh(
        constructionGeometry({ kit: kitId, size: sfp.size, stage: Number(stage), delivered, seed: i + 1 }),
        material,
      );
      site.position.set(x, 0, -sfp.size[1] / 2);
      row.add(site);
      x += sfp.size[0] + 0.6;
      return;
    }
    const { id: kitId, fp } = kitAndSize(id);
    const kit = kitById.get(kitId);
    if (!kit) return;
    const joins: Record<string, string> = {};
    if (join && isRowKit(kitId)) {
      if (i > 0 && isRowKit(kitOf(i - 1))) joins.joinL = kitOf(i - 1);
      if (i < ids.length - 1 && isRowKit(kitOf(i + 1))) joins.joinR = kitOf(i + 1);
    }
    const opts: KitBuildOptions = {
      seed: Number.isFinite(seeds[i]) && seeds[i]! > 0 ? seeds[i]! : state.seed + i,
      ...(fp ?? {}),
      params: { ...params, ...joins },
      ...(state.lod === 'low' ? { lod: 'low' as const } : {}),
    };
    const w = fp ? fp.size[0] : 0.7;
    const mesh = new Mesh(kit.build(opts), material);
    mesh.position.set(x + (fp ? 0 : 0.35), 0, fp ? (join ? -fp.size[1] : -fp.size[1] / 2) : 0);
    row.add(mesh);
    for (const p of kit.parts?.(opts) ?? []) {
      const pg = p.geometry.clone().translate(-p.pivot[0], -p.pivot[1], -p.pivot[2]);
      const pm = new Mesh(pg, material);
      pm.position.set(mesh.position.x + p.pivot[0], p.pivot[1], mesh.position.z + p.pivot[2]);
      row.add(pm);
      parts.push({ mesh: pm, speed: p.spinSpeed ?? 0 });
    }
    x += w + (fp ? (join ? 0 : 0.6) : 0.15);
  });
  row.position.x = -(x - 0.6) / 2;
  holder.add(row);
  info.textContent = `lineup: ${ids.join(', ')}`;
  lineupWidth = x - 0.6;
  return row;
}

/**
 * C4E: a grid of kits by district style (?scene=grid&rows=timber,stone,brick,plaster&kits=cottage,
 * townhouse@2x3,shop). Each row passes its style in params; columns keep their seeds across rows so
 * the same building can be compared style by style. `params` adds to every cell.
 */
let gridSize = [4, 4];
function buildGrid(): void {
  for (const c of [...holder.children]) holder.remove(c);
  const rows = (q.get('rows') ?? 'timber,stone,brick,plaster').split(',');
  const specs = (q.get('kits') ?? 'cottage,townhouse,shop,workshop,farmstead').split(',');
  const seeds = (q.get('seeds') ?? '').split(',').map(Number);
  const extra: Record<string, string | number | boolean> = {};
  for (const kv of (q.get('params') ?? '').split(';').filter(Boolean)) {
    const i = kv.lastIndexOf(':');
    if (i > 0)
      extra[kv.slice(0, i)] = Number.isFinite(Number(kv.slice(i + 1)))
        ? Number(kv.slice(i + 1))
        : kv.slice(i + 1);
  }
  const gap = Number(q.get('gap') ?? 0.5);
  const cols = specs.map(kitAndSize);
  const colW = cols.map((c) => c.fp?.size[0] ?? 1);
  const rowD = Math.max(...cols.map((c) => c.fp?.size[1] ?? 1));
  let total = 0;
  for (const w of colW) total += w + gap;
  rows.forEach((style, r) => {
    let x = -total / 2;
    cols.forEach(({ id, fp }, i) => {
      const kit = kitById.get(id);
      if (!kit) return;
      const opts: KitBuildOptions = {
        seed: Number.isFinite(seeds[i]) && seeds[i]! > 0 ? seeds[i]! : state.seed + i * 3,
        ...(fp ?? {}),
        // A row is a district style, or k:v params for the whole row (season:3), or '-' for none.
        params: {
          ...(style.includes(':')
            ? { [style.slice(0, style.indexOf(':'))]: Number(style.slice(style.indexOf(':') + 1)) }
            : style && style !== '-'
              ? { style }
              : {}),
          ...extra,
        },
        ...(state.lod === 'low' ? { lod: 'low' as const } : {}),
      };
      const mesh = new Mesh(kit.build(opts), material);
      mesh.position.set(x, 0, (r - (rows.length - 1) / 2) * (rowD + gap) - (fp?.size[1] ?? 1) / 2);
      holder.add(mesh);
      x += colW[i]! + gap;
    });
  });
  info.textContent = `grid: ${rows.join(', ')} x ${specs.join(', ')}`;
  gridSize = [total, rows.length * (rowD + gap)];
}

/** V1B: a text label as a sprite lying under a model (`size` is its width in tiles). */
function label(text: string, size: number): Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255, 250, 240, 0.92)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#3a2e26';
  g.font = '600 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2);
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), depthTest: false }));
  sprite.scale.set(size, (size * c.height) / c.width, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * V1B: every generator at both levels (?scene=levels&page=0, or &kits=cottage,shop): the near level
 * on the left of each pair, the far level on the right, and the triangle counts printed under
 * each. `style` passes a district style to every kit; `per` sets kits per page.
 */
const LEVEL_KITS = kits.filter((k) => k.kind === 'building').map((k) => k.id);
let levelsSize = [8, 6];
function buildLevels(): void {
  for (const c of [...holder.children]) holder.remove(c);
  const per = Number(q.get('per') ?? 6);
  const page = Number(q.get('page') ?? 0);
  const list = q.get('kits') ? q.get('kits')!.split(',') : LEVEL_KITS.slice(page * per, page * per + per);
  const style = q.get('style') ?? '';
  const cols = Number(q.get('cols') ?? 3);
  const cells = list.map(kitAndSize);
  const cellW = Math.max(...cells.map((c) => (c.fp?.size[0] ?? 1) * 2 + 0.5)) + 0.7;
  const cellD = Math.max(...cells.map((c) => c.fp?.size[1] ?? 1)) + 1.1;
  const rows = Math.ceil(cells.length / cols);
  const counts: string[] = [];
  cells.forEach(({ id, fp }, i) => {
    const kit = kitById.get(id);
    if (!kit) return;
    const cx = ((i % cols) - (cols - 1) / 2) * cellW;
    const cz = (Math.floor(i / cols) - (rows - 1) / 2) * cellD;
    const [w, d] = fp?.size ?? [1, 1];
    const tris: number[] = [];
    (['high', 'low'] as const).forEach((lod, k) => {
      const opts: KitBuildOptions = {
        seed: state.seed + i,
        ...(fp ?? {}),
        params: style ? { style } : {},
        lod,
      };
      const g = kit.build(opts);
      tris.push(g.getAttribute('position').count / 3);
      const mesh = new Mesh(g, material);
      mesh.position.set(cx + (k === 0 ? -w - 0.25 : 0.25), 0, cz - d / 2);
      holder.add(mesh);
    });
    const tag = label(`${id}: ${tris[0]} / ${tris[1]}`, Math.min(2.6, cellW * 0.6));
    tag.position.set(cx, 0.05, cz + d / 2 + 0.38);
    holder.add(tag);
    counts.push(`${id} ${tris[0]}/${tris[1]}`);
  });
  info.textContent = `levels (near / far triangles): ${counts.join(', ')}`;
  levelsSize = [cols * cellW, rows * cellD];
}

/**
 * V1B: the swap, for a clip (?scene=swap&kits=cottage,townhouse,shop&style=brick&at=14): a row of
 * homes, each built at both levels; the camera dollies out and back in, and each home shows its far
 * level beyond `at` tiles (5% hysteresis either side, as lod.ts swaps). `window.__swap(t)` puts the
 * camera at time t (0 to 1) and draws, so a script can step through frames.
 */
const swapItems: { high: Mesh; low: Mesh; near: Sprite; far: Sprite; low_: boolean }[] = [];
function buildSwap(): void {
  for (const c of [...holder.children]) holder.remove(c);
  const ids = (q.get('kits') ?? 'cottage,townhouse,shop,cottage').split(',');
  const style = q.get('style') ?? 'brick';
  let x = 0;
  const row = new Group();
  ids.forEach((spec, i) => {
    const { id, fp } = kitAndSize(spec);
    const kit = kitById.get(id);
    if (!kit || !fp) return;
    const joins: Record<string, string> = {};
    const kitOf = (k: number): string => kitAndSize(ids[k] ?? '').id;
    if (i > 0 && isRowKit(kitOf(i - 1)) && isRowKit(id)) joins.joinL = kitOf(i - 1);
    if (i < ids.length - 1 && isRowKit(kitOf(i + 1)) && isRowKit(id)) joins.joinR = kitOf(i + 1);
    const opts: KitBuildOptions = { seed: state.seed + i, ...fp, params: { style, ...joins } };
    const high = new Mesh(kit.build(opts), material);
    const low = new Mesh(kit.build({ ...opts, lod: 'low' }), material);
    for (const m of [high, low]) {
      m.position.set(x, 0, -fp.size[1]);
      row.add(m);
    }
    const near = label('near', 0.9);
    const far = label('far', 0.9);
    for (const t of [near, far]) {
      t.position.set(x + fp.size[0] / 2, 0.05, 0.45);
      row.add(t);
    }
    swapItems.push({ high, low, near, far, low_: false });
    x += fp.size[0];
  });
  row.position.x = -x / 2;
  holder.add(row);
  state.spin = false;
}

function swapAt(t: number): void {
  const at = Number(q.get('at') ?? 14);
  // Out from close up to twice the swap distance and back, along a fixed bearing.
  const k = t < 0.5 ? t * 2 : 2 - t * 2;
  const dist = 4 + (at * 2 - 4) * (0.5 - 0.5 * Math.cos(Math.PI * k));
  const yaw = 0.45;
  camera.position.set(Math.sin(yaw) * dist, dist * 0.7, Math.cos(yaw) * dist);
  controls.target.set(0, 0.6, 0);
  camera.lookAt(controls.target);
  for (const it of swapItems) {
    const d = camera.position.distanceTo(it.high.position.clone().add(holder.children[0]!.position));
    it.low_ = it.low_ ? d > at * 0.95 : d > at * 1.05;
    it.high.visible = !it.low_;
    it.low.visible = it.low_;
    it.near.visible = !it.low_;
    it.far.visible = it.low_;
  }
}
(window as unknown as { __swap: (t: number) => void }).__swap = (t: number) => {
  swapAt(t);
  renderer.render(scene, camera);
};

/**
 * C4E: village folk (?scene=folk): the story characters in their outfits, a couple hand in hand,
 * a parent with a baby in a sling, and the farm animals and the cart beside them.
 */
function buildFolk(): void {
  for (const c of [...holder.children]) holder.remove(c);
  figures.length = 0;
  const story = ['mouse', 'fox', 'rabbit', 'otter', 'hedgehog'];
  story.forEach((species, i) => {
    const fig = makeFigure(
      { species, look: 11 + i * 5, stage: 'adult', story: true },
      residentMaterial,
      'full',
      i,
    );
    fig.group.position.set((i - 2) * 0.42, 0, 0.45);
    holder.add(fig.group);
    figures.push({ fig, anim: 0, speed: 0, phase: i });
  });
  // A couple walking hand in hand, a parent with the baby, a child.
  const a = makeFigure(
    { species: 'rabbit', look: 40, stage: 'adult', tier: 'craftsfolk' },
    residentMaterial,
    'full',
    6,
  );
  const b = makeFigure({ species: 'hedgehog', look: 41, stage: 'adult' }, residentMaterial, 'full', 7);
  a.group.position.set(-0.75, 0, -0.05);
  b.group.position.set(-0.54, 0, -0.05);
  holder.add(a.group, b.group);
  figures.push(
    { fig: a, anim: 1, speed: 1.6, phase: 0, hold: 1 },
    { fig: b, anim: 1, speed: 1.6, phase: 0, hold: 2 },
  );
  const parent = makeFigure({ species: 'otter', look: 43, stage: 'adult' }, residentMaterial, 'full', 8, [
    { kind: 'sling', color: 0xd48a86 },
  ]);
  parent.group.position.set(-0.1, 0, -0.05);
  holder.add(parent.group);
  figures.push({ fig: parent, anim: 0, speed: 0, phase: 0 });
  const child = makeFigure({ species: 'squirrel', look: 44, stage: 'child' }, residentMaterial, 'full', 9);
  child.group.position.set(0.18, 0, -0.05);
  holder.add(child.group);
  figures.push({ fig: child, anim: 3, speed: 0, phase: 0 });
  // The animals and the cart.
  const animals: [string, number, number, number][] = [
    ['sheep', 0, 0.55, -0.1],
    ['sheep', 2, 0.85, -0.2],
    ['cow', 0, 1.3, -0.15],
    ['cow', 2, 1.3, -0.75],
    ['pony', 1, 0.6, -0.75],
  ];
  for (const [id, seed, x, z] of animals) {
    const mesh = new Mesh(kitById.get(id)!.build({ seed }), material);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = 0.5;
    holder.add(mesh);
  }
  const cartMesh = new Mesh(kitById.get('cart')!.build({ seed: 2, params: { load: 'cheese' } }), material);
  cartMesh.position.set(-0.5, 0, -0.85);
  cartMesh.rotation.y = 1.2;
  holder.add(cartMesh);
  info.textContent = 'village folk: story characters, a couple, a sling, animals and a cart';
}

const JOBS = ['bakery', 'farmhouse', 'fishers-hut', 'woodcutter', 'market-stall', 'builders-yard', ''];
const ANIMS: Record<string, number> = { idle: 0, walk: 1, carry: 2, hop: 3, work: 4 };

/** All seven species in a row: adults in work clothes at the front, a second outfit and a child behind. */
function buildResidents(): void {
  for (const c of [...holder.children]) holder.remove(c);
  figures.length = 0;
  const n = SPECIES_IDS.length;
  SPECIES_IDS.forEach((species, i) => {
    const x = (i - (n - 1) / 2) * 0.42;
    const rows: [number, string, number][] = [
      [0.35, 'adult', 0],
      [-0.1, 'adult', 1],
      [-0.5, 'child', 2],
    ];
    for (const [z, stage, k] of rows) {
      const look = state.seed * 31 + i * 7 + k * 3;
      const job = k === 0 ? JOBS[i % JOBS.length]! : k === 1 ? JOBS[(i + 3) % JOBS.length]! : '';
      const fig = makeFigure({ species, look, stage, job, tier: 'settler' }, residentMaterial, 'full', i + k);
      fig.group.position.set(x + (k === 1 ? 0.12 : 0), 0, z);
      holder.add(fig.group);
      const anim = animParam ? (ANIMS[animParam] ?? 0) : k === 1 ? 1 : 0;
      figures.push({ fig, anim, speed: 2.4 + i * 0.1, phase: i });
    }
  });
  info.textContent = `residents: ${SPECIES_IDS.length} species`;
}

function applyLight(): void {
  const n = state.night;
  sun.color.set(new Color(0xfff4e0).lerp(new Color(0x9db4d8), n));
  sun.intensity = 1.8 - n * 1.4;
  hemi.color.set(new Color(0xdde8f0).lerp(new Color(0x2b3a55), n));
  hemi.groundColor.set(new Color(0x7a8f5a).lerp(new Color(0x1e2433), n));
  hemi.intensity = 1.1 - n * 0.5;
  scene.background = new Color(0xa9d3ec).lerp(new Color(0x26324a), n);
  nightUniform.value = Math.max(0, (n - 0.4) / 0.6);
}

// Controls.
const panel = document.createElement('div');
panel.className = 'label';
document.body.appendChild(panel);
if (q.get('hud') === '0') panel.style.display = 'none';
const info = document.createElement('div');
const select = document.createElement('select');
select.add(new Option('set: trees by stage', 'set:trees'));
select.add(new Option('set: nature props', 'set:nature'));
for (const k of kits) select.add(new Option(`${k.kind}: ${k.id}`, k.id));
select.value = state.set ? `set:${state.set}` : state.kit;
select.onchange = () => {
  if (select.value.startsWith('set:')) state.set = select.value.slice(4);
  else {
    state.set = '';
    state.kit = select.value;
  }
  rebuild();
};
panel.append(select, info);
function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  on: (v: number) => void,
): void {
  const row = document.createElement('label');
  row.textContent = `${label} `;
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min, max, step, value });
  input.oninput = () => on(Number(input.value));
  row.appendChild(input);
  panel.appendChild(row);
}
slider('Seed', 1, 50, 1, state.seed, (v) => ((state.seed = v), rebuild()));
slider('Stage', 0, 3, 1, 3, (v) => ((state.stage = v), rebuild()));
slider('Low LOD', 0, 1, 1, 0, (v) => ((state.lod = v ? 'low' : 'high'), rebuild()));
slider('Wall', -1, 4, 1, -1, (v) => ((state.wall = v), rebuild()));
slider('Roof', -1, 4, 1, -1, (v) => ((state.roof = v), rebuild()));
slider('Night', 0, 1, 0.01, state.night, (v) => ((state.night = v), applyLight()));
slider('Turntable', 0, 1, 1, state.spin ? 1 : 0, (v) => (state.spin = v === 1));

const camera = new PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(5.5, 4, 6.5);
if (state.set) {
  camera.position.set(4.5, 6, 10);
  ground.scale.setScalar(1.8);
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
if (sceneName === 'lineup') {
  buildLineup();
  const dist = Number(q.get('dist') ?? Math.max(5, lineupWidth * 1.15 + 2));
  const yaw = Number(q.get('yaw') ?? 0.5);
  camera.position.set(Math.sin(yaw) * dist, dist * 0.62, Math.cos(yaw) * dist);
  controls.target.set(0, Number(q.get('ty') ?? 0.6), 0);
  state.spin = false;
} else if (sceneName === 'grid') {
  buildGrid();
  const dist = Number(q.get('dist') ?? Math.max(6, Math.max(gridSize[0]!, gridSize[1]! * 1.4) * 1.05 + 2));
  const yaw = Number(q.get('yaw') ?? 0.35);
  camera.position.set(Math.sin(yaw) * dist, dist * Number(q.get('pitch') ?? 0.75), Math.cos(yaw) * dist);
  controls.target.set(0, Number(q.get('ty') ?? 0.4), 0);
  ground.scale.setScalar(2);
  state.spin = false;
} else if (sceneName === 'levels') {
  buildLevels();
  const dist = Number(q.get('dist') ?? Math.max(levelsSize[0]! * 0.92, levelsSize[1]! * 1.7));
  const yaw = Number(q.get('yaw') ?? 0.3);
  camera.position.set(Math.sin(yaw) * dist, dist * Number(q.get('pitch') ?? 0.8), Math.cos(yaw) * dist);
  controls.target.set(0, 0.3, 0.2);
  ground.scale.setScalar(2.5);
  state.spin = false;
} else if (sceneName === 'swap') {
  buildSwap();
  swapAt(Number(q.get('t') ?? 0));
} else if (sceneName === 'folk') {
  buildFolk();
  camera.position.set(0.3, 1.5, 3.6);
  controls.target.set(0.1, 0.12, -0.15);
  state.spin = false;
} else if (sceneName === 'surfaces') {
  // V1A: every surface at three sizes; ?dist sets how far back the camera stands.
  const { group } = buildSurfaces(material);
  holder.add(group);
  renderer.toneMapping = NeutralToneMapping;
  const dist = Number(q.get('dist') ?? 26);
  const yaw = Number(q.get('yaw') ?? 0.25);
  camera.fov = 30;
  camera.far = 400;
  camera.updateProjectionMatrix();
  camera.position.set(Math.sin(yaw) * dist * 0.7, dist * 0.72, Math.cos(yaw) * dist * 0.7);
  controls.target.set(0, 0.2, 0.4);
  ground.scale.setScalar(3);
  state.spin = false;
  info.textContent = `surfaces (${seasonParam}): ${SURFACE_ORDER.join(', ')}`;
  // For the shimmer check: a script steps the camera back along the same line, frame by frame.
  (window as unknown as { surfacesView: (d: number) => void }).surfacesView = (d) => {
    camera.position.set(Math.sin(yaw) * d * 0.7, d * 0.72, Math.cos(yaw) * d * 0.7);
    controls.update();
  };
} else if (sceneName === 'seasons') {
  // C5E part 2: the trees in each season, with the game's foliage material.
  const { group, size } = buildSeasons(state.seed);
  holder.add(group);
  const dist = Number(q.get('dist') ?? Math.max(size[0], size[1]) * 1.7 + 2);
  const yaw = Number(q.get('yaw') ?? 0.15);
  camera.position.set(Math.sin(yaw) * dist, dist * Number(q.get('pitch') ?? 0.7), Math.cos(yaw) * dist);
  controls.target.set(0.6, 0.4, -1.2);
  ground.scale.setScalar(2);
  state.spin = false;
  info.textContent = `seasons, left to right: ${SEASON_NAMES.join(', ')} (oak, birch, pine, apple, cherry, pear)`;
} else if (sceneName === 'trades') {
  // R1E: every trade at levels 1 to 3 (and level 3 far), and the specialized buildings.
  const { group, size, counts } = buildTrades(q, material, state.seed);
  holder.add(group);
  const dist = Number(q.get('dist') ?? Math.max(size[0] * 1.1, size[1] * 1.1) + 2);
  const yaw = Number(q.get('yaw') ?? 0.3);
  camera.position.set(Math.sin(yaw) * dist, dist * Number(q.get('pitch') ?? 0.85), Math.cos(yaw) * dist);
  // The grid sits a little low, clear of the panel (?tz moves it).
  controls.target.set(0, 0.3, Number(q.get('tz') ?? -size[1] * 0.18));
  ground.scale.setScalar(3);
  state.spin = false;
  info.textContent = `trades, levels 1 to 3 and far (triangles): ${counts.join(', ')}`;
} else if (sceneName === 'residents') {
  buildResidents();
  camera.position.set(0.1, 1.1, 3.6);
  controls.target.set(0, 0.12, -0.05);
  state.spin = false;
} else rebuild();
applyLight();

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.spin) holder.rotation.y += dt * 0.35;
  for (const p of parts) p.mesh.rotation.z += dt * p.speed;
  residentTime.value += dt;
  for (const f of figures) {
    f.phase += dt * f.speed * Math.PI * 2 * (f.anim === 1 || f.anim === 2 ? 1 : 0);
    f.fig.pose(f.anim, f.phase, f.hold ?? 0);
    const bob = f.anim === 1 || f.anim === 2 ? Math.abs(Math.sin(f.phase)) * 0.016 : 0;
    const hop = f.anim === 3 ? Math.abs(Math.sin(residentTime.value * 5.5)) * 0.1 : 0;
    for (const m of f.fig.meshes) m.position.y = (bob + hop) / f.fig.group.scale.y;
  }
  if (sceneName === 'swap') return;
  controls.update();
  renderer.render(scene, camera);
});
