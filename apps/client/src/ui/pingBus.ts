// A tiny shared channel for pings: the ping tool and the Alt+click menu ask for a ping here, and
// the session (which owns the connection) sends it and shows it locally.
import { signal } from '@preact/signals';

export type PingKind = 'look' | 'help' | 'build';

export interface PingMenu {
  x: number;
  z: number;
  /** Screen position for the menu, in CSS pixels. */
  sx: number;
  sy: number;
}

export const pingMenu = signal<PingMenu | null>(null);

type Sender = (x: number, z: number, kind: PingKind) => void;
let sender: Sender | null = null;

export function setPingSender(fn: Sender | null): void {
  sender = fn;
}

export function sendPing(x: number, z: number, kind: PingKind): void {
  sender?.(x, z, kind);
}
