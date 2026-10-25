import { signal } from '@preact/signals';
import { content } from '@qoti/content';
import type { RenderApi } from '../render/api';
import type { ToolContext } from './context';
import type { PointerInfo, Tool } from './tool';
import { toolFactories } from './tools';

export interface ManagerHooks {
  /** Every pointer move over the canvas (for presence). */
  pointer(p: PointerInfo): void;
  /** Keys no tool used: pause, speed, lens and so on. Returns true when handled. */
  globalKey(e: KeyboardEvent): boolean;
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** Owns the tools and routes left-button pointer input and keys to the active one. */
export class ToolManager {
  readonly tools: Tool[];
  readonly active = signal('inspect');
  private readonly byId: Map<string, Tool>;
  private current: Tool;
  private last: { x: number; y: number } | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly ctx: ToolContext,
    private readonly render: RenderApi,
    canvas: HTMLElement,
    private readonly hooks: ManagerHooks,
  ) {
    this.tools = toolFactories.map((make) => make(ctx)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    this.byId = new Map(this.tools.map((t) => [t.id, t]));
    this.current = this.byId.get('inspect')!;
    this.current.enter?.();

    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(canvas, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      this.current.pointerDown?.(this.info(e));
    });
    on(canvas, 'pointermove', (e) => {
      this.last = { x: e.clientX, y: e.clientY };
      const info = this.info(e);
      this.hooks.pointer(info);
      this.current.pointerMove?.(info);
    });
    on(canvas, 'pointerup', (e) => {
      if (e.button !== 0) return;
      this.current.pointerUp?.(this.info(e));
    });
    on(canvas, 'pointerleave', () => this.render.setGhost(null));
    on(window, 'keydown', (e) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (this.current.key?.(e) || this.eyedropper(e) || this.hooks.globalKey(e)) e.preventDefault();
    });
  }

  private info(e: PointerEvent): PointerInfo {
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      tile: this.render.pickTile(e.clientX, e.clientY),
    };
  }

  /** I picks up whatever is under the cursor: the matching tool, with that piece selected. */
  private eyedropper(e: KeyboardEvent): boolean {
    if ((e.key !== 'i' && e.key !== 'I') || !this.last) return false;
    const { x, y } = this.last;
    const hit = this.render.pickEntity(x, y);
    if (hit?.kind === 'building') {
      const b = this.ctx.mirror.buildings.get(hit.id);
      if (b) this.select('building', b.def);
      return !!b;
    }
    if (hit?.kind === 'decor') {
      const d = this.ctx.mirror.decor.get(hit.id);
      if (d) this.select(content.decorById.get(d.def)?.linear ? 'fence' : 'decor', d.def);
      return !!d;
    }
    if (hit?.kind === 'tree') {
      this.select('tree');
      return true;
    }
    if (hit?.kind === 'note') {
      this.select('note');
      return true;
    }
    const tile = this.render.pickTile(x, y);
    const value = tile ? this.ctx.mirror.road(tile.x, tile.z) : 0;
    const road = value ? content.roads.find((r) => r.layerValue === value) : undefined;
    if (road) this.select(road.id);
    return !!road;
  }

  tool(id: string): Tool | undefined {
    return this.byId.get(id);
  }

  select(id: string, variant?: string): void {
    const next = this.byId.get(id);
    if (!next) return;
    if (variant && next.variant) next.variant.value = variant;
    if (next === this.current) return;
    this.current.exit?.();
    this.render.setGhost(null);
    this.current = next;
    this.active.value = id;
    next.enter?.();
  }

  dispose(): void {
    this.current.exit?.();
    for (const fn of this.cleanup) fn();
  }
}
