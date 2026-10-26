import { SNAPSHOTS_KEPT, type RoomStorage, type StoredMeta, type StoredSnapshot } from '@qoti/protocol';
import type { SeatedCommand, Turn } from '@qoti/sim';

// The schema from docs/spec/21-networking-and-saves.md, Hosting.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS turns (t INTEGER PRIMARY KEY, cmds TEXT);
CREATE TABLE IF NOT EXISTS snapshots (t INTEGER PRIMARY KEY, sim_version TEXT, label TEXT, created INTEGER, data BLOB);
`;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** RoomStorage on a Durable Object's SQLite database. Snapshots are stored as raw gzip bytes. */
export class SqliteStorage implements RoomStorage {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(SCHEMA);
  }

  async getMeta(): Promise<StoredMeta | null> {
    const row = this.sql.exec<{ v: string }>('SELECT v FROM meta WHERE k = ?', 'meta').toArray()[0];
    return row ? (JSON.parse(row.v) as StoredMeta) : null;
  }

  async putMeta(m: StoredMeta): Promise<void> {
    this.sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', 'meta', JSON.stringify(m));
  }

  async appendTurn(turn: Turn): Promise<void> {
    this.sql.exec('INSERT INTO turns (t, cmds) VALUES (?, ?)', turn.t, JSON.stringify(turn.cmds));
  }

  async turnsAfter(t: number): Promise<Turn[]> {
    return this.sql
      .exec<{ t: number; cmds: string }>('SELECT t, cmds FROM turns WHERE t > ? ORDER BY t', t)
      .toArray()
      .map((row) => ({ t: row.t, cmds: JSON.parse(row.cmds) as SeatedCommand[] }));
  }

  async putSnapshot(s: StoredSnapshot): Promise<void> {
    const bytes = fromBase64(s.data);
    this.sql.exec(
      'INSERT OR REPLACE INTO snapshots (t, sim_version, label, created, data) VALUES (?, ?, ?, ?, ?)',
      s.t,
      s.simVersion,
      s.label,
      s.created,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    // Keep the latest snapshots; named seasonal backups arrive with C2C.
    this.sql.exec(
      'DELETE FROM snapshots WHERE t NOT IN (SELECT t FROM snapshots ORDER BY t DESC LIMIT ?)',
      SNAPSHOTS_KEPT,
    );
  }

  async latestSnapshot(): Promise<StoredSnapshot | null> {
    const row = this.sql
      .exec<{ t: number; sim_version: string; label: string | null; created: number; data: ArrayBuffer }>(
        'SELECT t, sim_version, label, created, data FROM snapshots ORDER BY t DESC LIMIT 1',
      )
      .toArray()[0];
    if (!row) return null;
    return {
      t: row.t,
      simVersion: row.sim_version,
      label: row.label,
      created: row.created,
      data: toBase64(new Uint8Array(row.data)),
    };
  }

  async pruneTurnsUpTo(t: number): Promise<void> {
    this.sql.exec('DELETE FROM turns WHERE t <= ?', t);
  }
}
