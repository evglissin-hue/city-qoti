// Room limits (docs/spec/21-networking-and-saves.md, Security and privacy, Presence).

export const TURN_MS = 100;
export const HELLO_TIMEOUT_MS = 5000;
export const SNAPSHOT_EVERY_TURNS = 300;
/** nextTurn is written to storage this often, so a restarted room resumes close to where it was. */
export const META_SAVE_EVERY_TURNS = 50;
export const SNAPSHOTS_KEPT = 20;
export const HASHES_KEPT_TURNS = 600;

export const MAX_CMD_BYTES = 8 * 1024;
export const MAX_PRESENCE_BYTES = 256;
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
/** Any other message kind. */
export const MAX_OTHER_BYTES = 8 * 1024;

export const CMDS_PER_SECOND = 30;
/** Cursor updates: the client sends 10 a second while the pointer moves; a little headroom for jitter. */
export const PRESENCE_PER_SECOND = 12;
export const PINGS_PER_SECOND = 2;

/** WebSocket close codes the room uses (4000 to 4999 are free for applications). */
export const CloseCode = {
  normal: 1000,
  badHello: 4000,
  replaced: 4001,
  badToken: 4003,
  notFound: 4004,
  versionMismatch: 4009,
  helloTimeout: 4008,
} as const;
