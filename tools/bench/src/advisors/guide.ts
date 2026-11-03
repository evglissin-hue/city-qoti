// The guide advisor (C5H): the two players read the County surveyor's letters and carry on with
// their own plan. It plays while the first days guide is open, notes each new letter in the action
// log, and proposes nothing, so the guide never changes what the autoplayer builds (the I2 tune
// numbers stay put). guide.test.ts checks that playing sensibly finishes every step anyway.
import { content } from '@qoti/content';
import type { Planner } from '../planner';
import type { Advisor, AdvisorDef } from './types';

class Guide implements Advisor {
  private read = -1;
  constructor(readonly p: Planner) {}

  visit(): void {
    const g = this.p.w.guide;
    if (g.over || g.step === this.read) return;
    this.read = g.step;
    const step = content.guide.steps[g.step];
    if (step) this.p.actions.push(`letter: ${step.id} (read, filed)`);
  }
}

export const guide: AdvisorDef = {
  id: 'guide',
  slot: 90,
  plays: (_opts, w) => !w.guide.over,
  create: (p) => new Guide(p),
};
