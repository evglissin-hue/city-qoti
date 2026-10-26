import type { Command, Lens, SeatId } from '@qoti/sim';
import type { RenderApi } from '../render/api';
import type { Mirror } from '../state/mirror';
import type { CameraController } from './camera';

export type Selection =
  | { kind: 'building' | 'decor' | 'note' | 'resident'; id: number }
  | { kind: 'tree' | 'tile'; x: number; z: number };

/** What tools need from the UI: messages, questions and the inspector selection. */
export interface UiApi {
  toast(text: string): void;
  confirm(text: string, ok: string, cancel: string): Promise<boolean>;
  prompt(title: string, placeholder: string, maxLength: number): Promise<string | null>;
  select(selection: Selection | null): void;
  lens(): Lens;
}

/** Everything a tool may touch. Tools never reach into the session directly. */
export interface ToolContext {
  mirror: Mirror;
  render: RenderApi;
  camera: CameraController;
  seat: SeatId;
  submit(cmd: Command): number;
  ui: UiApi;
}
