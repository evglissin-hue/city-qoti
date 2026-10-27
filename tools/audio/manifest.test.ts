import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const publicAudio = join(here, '..', '..', 'apps', 'client', 'public', 'audio');
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8')) as {
  files: {
    id: string;
    kind: string;
    source: string;
    url: string;
    author: string;
    license: string;
    sha256: string;
  }[];
};

describe('audio manifest', () => {
  it('lists every sound file in public/audio, each CC0 or public domain with its source', () => {
    const ids = new Set(manifest.files.map((f) => f.id));
    const files = readdirSync(publicAudio).filter((f) => f !== 'CREDITS.md');
    for (const f of files) expect(ids.has(f.replace(/\.m4a$/, '')), `${f} has no manifest line`).toBe(true);
    for (const f of manifest.files) {
      expect(['CC0-1.0', 'PD']).toContain(f.license);
      expect(f.source).toMatch(/^https:\/\//);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(['music', 'ambience', 'effect']).toContain(f.kind);
    }
  });

  it('keeps the credits in step with the manifest', () => {
    const credits = readFileSync(join(publicAudio, 'CREDITS.md'), 'utf8');
    for (const f of manifest.files) expect(credits).toContain(`\`${f.id}.m4a\``);
  });
});
