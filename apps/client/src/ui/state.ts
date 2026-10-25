import { signal } from '@preact/signals';
import type { Lens } from '@qoti/sim';
import type { Selection } from '../input/context';

export interface Toast {
  id: number;
  text: string;
  x: number;
  y: number;
}

export type Dialog =
  | { kind: 'confirm'; text: string; ok: string; cancel: string; resolve(v: boolean): void }
  | { kind: 'prompt'; title: string; placeholder: string; max: number; resolve(v: string | null): void };

export function createUiState() {
  return {
    lens: signal<Lens>('hearth'),
    selection: signal<Selection | null>(null),
    toasts: signal<Toast[]>([]),
    dialog: signal<Dialog | null>(null),
    inviteOpen: signal(false),
    notesOpen: signal(true),
    helpOpen: signal(false),
    /** Partner cursors in world tiles, by seat, for name labels and off-screen arrows. */
    cursors: signal<Map<number, { x: number; z: number; tool?: string }>>(new Map()),
    settingsOpen: signal(false),
  };
}

export type UiState = ReturnType<typeof createUiState>;
