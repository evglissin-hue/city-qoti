import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The dead-end hunt's static check for "land could not be flattened": the sim had terrain commands,
// but no tool sent them. Every command in the contract union must be sent somewhere in the client
// (an object literal with `t: '<type>'`), or sit on the allowlist below with the reason it has no
// sender. A new command with no button fails here until it gets one or an honest reason.
const root = fileURLToPath(new URL('..', import.meta.url));

/** Command types the sim accepts that the client does not send, with why. */
export const NO_CLIENT_SENDER: Record<string, string> = {
  // System: only the room sends these (it drops any client-sent sys.*).
  'sys.seatJoined': 'system command, sent only by RoomCore when a seat connects',
  'sys.seatLeft': 'system command, sent only by RoomCore when a seat disconnects',
  // Honest gaps: the sim takes them, but no tool or button sends them yet. Each is a feature to
  // build, not a reason to keep the entry; the test says so when a sender appears.
  'plan.edit': 'NO UI YET: the sim can edit an open plan, the plans panel only adds, comments and resolves',
  // Covered another way.
  'wall.remove': 'walls are buildings: the demolish tool takes them down with build.remove',
};

/**
 * R1.0: commands that land before their buttons. Each names the cycle that owes the sender and why;
 * the entry comes off when that cycle ships it (the test says so), so this list only shrinks.
 */
export const OWED_SENDERS: Record<string, { cycle: 'R1C' | 'R1D'; why: string }> = {
  'carrier.setBudget': { cycle: 'R1C', why: "the Balances book sets the carrier's daily purse" },
  'carrier.setReserve': { cycle: 'R1C', why: "the Balances book sets each family's reserve" },
  'carrier.setRule': { cycle: 'R1C', why: "the Balances book sets each family's carrier rule and selling" },
  'season.setPlan': { cycle: 'R1C', why: 'the season card asks the Ledger its questions' },
};

function commandTypes(): string[] {
  const src = readFileSync(join(root, 'packages/sim/src/contracts/commands.ts'), 'utf8');
  const start = src.indexOf('export type Command =');
  const end = src.indexOf('\nexport ', start + 1);
  const block = src.slice(start, end < 0 ? undefined : end);
  // A member is `| { t: '...'; ... }` on one line, or `| {` with `t: '...'` on the next (festival.plan).
  return [...block.matchAll(/^ {2}\| \{\s*t: '([^']+)'/gm)].map((m) => m[1]!);
}

function clientSource(dir: string): string {
  let out = '';
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out += clientSource(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out += `${readFileSync(p, 'utf8')}\n`;
  }
  return out;
}

describe('every command has a sender', () => {
  const types = commandTypes();
  const client = clientSource(join(root, 'apps/client/src'));
  const sent = (t: string) => new RegExp(`\\bt: [^,}\\n]*'${t.replace('.', '\\.')}'`).test(client);

  it('reads the command union, members written over several lines too', () => {
    expect(types.length).toBeGreaterThan(40);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toContain('festival.plan');
    expect(types).toContain('build.move');
    // Every `t: '...'` in the union's block is a member the reader found (none hides on a new line).
    const src = readFileSync(join(root, 'packages/sim/src/contracts/commands.ts'), 'utf8');
    const block = src.slice(
      src.indexOf('export type Command ='),
      src.indexOf('\nexport ', src.indexOf('export type Command =') + 1),
    );
    const all = [...block.matchAll(/\bt: '([^']+)'/g)].map((m) => m[1]!);
    expect(types).toEqual(all);
  });

  it('is sent by the client, allowlisted with a reason, or owed by a named cycle', () => {
    const missing = types.filter((t) => !sent(t) && !(t in NO_CLIENT_SENDER) && !(t in OWED_SENDERS));
    expect(missing, 'commands no client code sends (add a sender or allowlist with a reason)').toEqual([]);
  });

  it('keeps the owed list honest: real commands, not sent yet, owed by R1C or R1D', () => {
    for (const [t, owed] of Object.entries(OWED_SENDERS)) {
      expect(types, `${t} is not a command`).toContain(t);
      expect(sent(t), `${t} is sent now: take it off OWED_SENDERS`).toBe(false);
      expect(['R1C', 'R1D'], `${t} must name the cycle that owes its sender`).toContain(owed.cycle);
      expect(owed.why.length, `${t} needs a reason`).toBeGreaterThan(10);
      expect(t in NO_CLIENT_SENDER, `${t} is both owed and allowlisted`).toBe(false);
    }
  });

  it('keeps the allowlist honest', () => {
    for (const [t, why] of Object.entries(NO_CLIENT_SENDER)) {
      expect(types, `${t} is not a command`).toContain(t);
      expect(sent(t), `${t} is sent now: take it off the allowlist`).toBe(false);
      expect(why.length, `${t} needs a reason`).toBeGreaterThan(10);
    }
  });
});
