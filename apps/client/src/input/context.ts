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
  // I1 (C3E)
  /** Opens the customization panel for a building. */
  customize?(id: number): void;
  /** The farmhouse the field tool paints for, if one is picked. */
  farm?(): number | null;
  setFarm?(id: number | null): void;
  /** Current selection, so tools can start from it (the field tool from a selected farmhouse). */
  selection?(): Selection | null;
  // I2 (C4F)
  /** Opens a book panel (the plan tool opens the plans book). */
  openPanel?(id: string | null): void;
  /** Draws one plan's blueprint (null clears it). */
  focusPlan?(id: number | null): void;
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
