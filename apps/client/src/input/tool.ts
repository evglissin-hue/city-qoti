// Tool contract (docs/spec/20-architecture.md, I0 contracts). Additive changes only during waves.
import type { Signal } from '@preact/signals';
import type { TilePick } from '../render/api';

export interface PointerInfo {
  clientX: number;
  clientY: number;
  /** 0 left, 1 middle, 2 right. */
  button: number;
  /** Bitmask of pressed buttons. */
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** The tile under the pointer, if any. */
  tile: TilePick | null;
}

export interface ToolVariant {
  id: string;
  label: string;
}

export interface Tool {
  id: string;
  lane: 'hearth' | 'ledger' | 'shared';
  icon: string;
  label: string;
  enter?(): void;
  exit?(): void;
  pointerMove?(p: PointerInfo): void;
  pointerDown?(p: PointerInfo): void;
  pointerUp?(p: PointerInfo): void;
  /** Returns true when the tool used the key. */
  key?(e: KeyboardEvent): boolean;
  // C1 additions: pieces the tool can place, picked in the toolbar.
  variants?: ToolVariant[];
  variant?: Signal<string>;
  /** Shortcut hint shown in the toolbar. */
  hint?: string;
  /** Position in the toolbar, lowest first. */
  order?: number;
  /** I1 (C3E) addition: valley modes whose toolbar shows the tool (default both). */
  modes?: readonly ('sandbox' | 'standard')[];
  /** Playtest addition: the overlay the tool shows while out (the toolbar's own waits), if any. */
  overlay?(): string | null;
}
