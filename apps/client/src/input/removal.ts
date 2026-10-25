import { signal } from '@preact/signals';

/** A pending "remove your partner's handmade work?" question, answered by RemovalConfirm. */
export interface RemovalRequest {
  title: string;
  body: string;
  placeholder: string;
  ok: string;
  cancel: string;
  /** Resolves with the optional reason ('' when none), or null when the player keeps it. */
  resolve(reason: string | null): void;
}

export const removalRequest = signal<RemovalRequest | null>(null);

/** Asks the player to confirm a removal. Any earlier open question is answered with "keep it". */
export function askRemoval(r: Omit<RemovalRequest, 'resolve'>): Promise<string | null> {
  removalRequest.value?.resolve(null);
  return new Promise((resolve) => {
    removalRequest.value = {
      ...r,
      resolve: (reason) => {
        removalRequest.value = null;
        resolve(reason);
      },
    };
  });
}
