import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Proves the lint rules in eslint.config.js: determinism bans in packages/sim and the
// package dependency rules. Fixtures are linted under virtual paths inside each package.
const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: root });

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

async function lint(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages;
}

describe('determinism lint in packages/sim', () => {
  it('reports every banned construct in the fixture', async () => {
    const messages = await lint(fixture('sim-banned.ts.txt'), 'packages/sim/src/lint-fixture.ts');
    const lines = new Set(messages.map((m) => m.line));
    // Lines 2 to 13 hold one banned construct each (7 timers, 8 async, 11 for-in, 12 keys, 13 locale).
    for (const line of [2, 3, 4, 5, 6, 7, 8, 11, 12, 13]) {
      expect(lines.has(line), `line ${line} should be reported`).toBe(true);
    }
  });

  it('names the rule for Math.random, Math.sin and **', async () => {
    const random = await lint('export const a = Math.random();\n', 'packages/sim/src/x.ts');
    const sin = await lint('export const b = Math.sin(1);\n', 'packages/sim/src/x.ts');
    const pow = await lint('export const c = 2 ** 8;\n', 'packages/sim/src/x.ts');
    expect(random.map((m) => m.ruleId)).toContain('no-restricted-properties');
    expect(sin.map((m) => m.ruleId)).toContain('no-restricted-properties');
    expect(pow.map((m) => m.ruleId)).toContain('no-restricted-syntax');
  });

  it('accepts integer math, Math.sqrt and Map iteration', async () => {
    const messages = await lint(fixture('sim-allowed.ts.txt'), 'packages/sim/src/lint-fixture.ts');
    expect(messages).toEqual([]);
  });

  it('does not apply the sim bans outside packages/sim', async () => {
    const messages = await lint('export const a = Math.random() + 2 ** 3;\n', 'apps/client/src/x.ts');
    expect(messages).toEqual([]);
  });
});

describe('package dependency rules', () => {
  it('keeps three out of the sim', async () => {
    const messages = await lint("import * as THREE from 'three';\nvoid THREE;\n", 'packages/sim/src/x.ts');
    expect(messages.map((m) => m.ruleId)).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('lets protocol import sim types but not sim code', async () => {
    const typeOnly = await lint(
      "import type { Turn } from '@qoti/sim';\nexport type T = Turn;\n",
      'packages/protocol/src/x.ts',
    );
    const runtime = await lint(
      "import { applyTurn } from '@qoti/sim';\nvoid applyTurn;\n",
      'packages/protocol/src/x.ts',
    );
    expect(typeOnly).toEqual([]);
    expect(runtime.map((m) => m.ruleId)).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('keeps content free of other packages', async () => {
    const messages = await lint(
      "import { applyTurn } from '@qoti/sim';\nvoid applyTurn;\n",
      'packages/content/src/x.ts',
    );
    expect(messages.map((m) => m.ruleId)).toContain('@typescript-eslint/no-restricted-imports');
  });
});
