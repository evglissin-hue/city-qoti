import { signal } from '@preact/signals';
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
  private readonly cleanup: (() => void)[] = [];

  constructor(
    ctx: ToolContext,
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
      if (this.current.key?.(e) || this.hooks.globalKey(e)) e.preventDefault();
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
