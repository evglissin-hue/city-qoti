import { MemoryImages, MemoryStorage, RoomCore, TURN_MS, type MemoryDump } from '@qoti/protocol';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAVE_DELAY_MS = 500;
const VALID_ID = /^[0-9a-f]{32}$/;

interface Room {
  core: RoomCore;
  storage: MemoryStorage;
  /** C5F: Chronicle snapshots, saved beside the valley as <id>.images.json. */
  images: MemoryImages;
  sockets: number;
  timer: ReturnType<typeof setInterval> | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

/** Valleys by id, each a RoomCore over MemoryStorage that is saved to dataDir/<id>.json. */
export class Rooms {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly dataDir: string,
    private readonly log: (msg: string) => void,
  ) {
    mkdirSync(dataDir, { recursive: true });
  }

  private file(id: string): string {
    return join(this.dataDir, `${id}.json`);
  }

  private imagesFile(id: string): string {
    return join(this.dataDir, `${id}.images.json`);
  }

  exists(id: string): boolean {
    return VALID_ID.test(id) && (this.rooms.has(id) || existsSync(this.file(id)));
  }

  /** Registers a new valley once its meta is written (RoomCore reads the meta when it starts). */
  adopt(id: string, storage: MemoryStorage): void {
    const room = this.load(id, storage);
    this.save(id, room);
  }

  get(id: string): Room | null {
    const loaded = this.rooms.get(id);
    if (loaded) return loaded;
    if (!this.exists(id)) return null;
    const dump = JSON.parse(readFileSync(this.file(id), 'utf8')) as MemoryDump;
    return this.load(id, MemoryStorage.restore(dump));
  }

  private load(id: string, storage: MemoryStorage): Room {
    const core = new RoomCore(storage, {
      turnMs: TURN_MS,
      now: () => Date.now(),
      log: (level, msg) => this.log(`[${id.slice(0, 6)}] ${level}: ${msg}`),
    });
    const imagesFile = this.imagesFile(id);
    const images = existsSync(imagesFile)
      ? MemoryImages.restore(JSON.parse(readFileSync(imagesFile, 'utf8')) as Parameters<typeof MemoryImages.restore>[0])
      : new MemoryImages();
    const room: Room = { core, storage, images, sockets: 0, timer: null, saveTimer: null };
    storage.onChange = () => {
      room.saveTimer ??= setTimeout(() => {
        room.saveTimer = null;
        this.save(id, room);
      }, SAVE_DELAY_MS);
    };
    // Pictures are written at once: they are few, and a reload right after an upload should see it.
    images.onChange = () => this.saveImages(id, room);
    this.rooms.set(id, room);
    return room;
  }

  private save(id: string, room: Room): void {
    // Write then rename, so a crash mid-write never leaves a half file behind.
    const tmp = `${this.file(id)}.tmp`;
    writeFileSync(tmp, JSON.stringify(room.storage.dump()));
    renameSync(tmp, this.file(id));
  }

  private saveImages(id: string, room: Room): void {
    const tmp = `${this.imagesFile(id)}.tmp`;
    writeFileSync(tmp, JSON.stringify(room.images.dump()));
    renameSync(tmp, this.imagesFile(id));
  }

  /** The room steps every TURN_MS while a socket is open, and once more after the last one closes. */
  socketOpened(room: Room): void {
    room.sockets++;
    room.timer ??= setInterval(() => room.core.step(), TURN_MS);
  }

  socketClosed(room: Room): void {
    room.sockets--;
    if (room.sockets > 0 || !room.timer) return;
    clearInterval(room.timer);
    room.timer = null;
    // Emit the turn that records the seat leaving.
    setTimeout(() => {
      if (room.sockets === 0) room.core.step();
    }, TURN_MS);
  }

  /** Stops every timer and writes every valley to disk. */
  async close(): Promise<void> {
    for (const [id, room] of this.rooms) {
      if (room.timer) clearInterval(room.timer);
      if (room.saveTimer) clearTimeout(room.saveTimer);
      await room.core.flush();
      this.save(id, room);
    }
    this.rooms.clear();
  }
}
