// P2: folk and open jobs, which the Folk chip and the feed both read.
import { BuildingStatus, type BuildingView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { readHands } from './hands';
import { mockSession } from './mocks/session';

function workplace(
  id: number,
  jobs: number,
  workers: number,
  status = 0,
  stage: 'built' | 'construction' = 'built',
) {
  const b: BuildingView = {
    id,
    def: 'granary',
    x: 20 + id,
    z: 20,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage,
    foundation: false,
    rt: {
      jobs,
      workers,
      present: 0,
      status: status | (workers === 0 && jobs > 0 ? BuildingStatus.noWorkers : 0),
      condition: 100,
      paused: (status & BuildingStatus.paused) !== 0,
      progress: 0,
      input: [],
      output: [],
      store: [],
    },
  };
  return b;
}

describe('readHands', () => {
  it('counts open jobs and the workplaces standing empty', () => {
    const { session } = mockSession();
    const m = session.mirror;
    m.buildings.clear();
    for (const b of [
      workplace(202, 2, 0),
      workplace(201, 4, 3),
      // Paused, resting and unbuilt workplaces ask for nobody.
      workplace(203, 2, 0, BuildingStatus.paused),
      workplace(204, 2, 0, BuildingStatus.resting),
      workplace(205, 2, 0, 0, 'construction'),
      workplace(200, 1, 0),
    ]) {
      m.buildings.set(b.id, b);
    }
    const r = readHands(m);
    expect(r.openJobs).toBe(2 + 1 + 1);
    expect(r.empty).toEqual([200, 202]);
    expect(r.folk).toBe(m.town.value!.population);
    expect(r.working).toBe([...m.residents.values()].filter((x) => x.jobId).length);
  });
});
