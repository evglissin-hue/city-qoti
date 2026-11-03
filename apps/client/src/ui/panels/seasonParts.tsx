// I3 (C5F): the season lines in the inspectors. Residents: warmth in winter, Watch duty, a reformed
// past. Buildings: modules fitted, a wall's hit points, a gate's open or shut (with the switch), and
// flood water.
import { content } from '@qoti/content';
import type { BuildingDetail, ResidentDetail } from '@qoti/sim';
import type { Session } from '../../app/session';
import { dayName } from '../seasons';
import { Meter } from './parts';

export function ResidentSeasonLines({ detail }: { detail: ResidentDetail }) {
  const w = detail.warmth;
  const watch = detail.watch;
  if (!w && !watch && !detail.reformed) return null;
  return (
    <ul class="season-lines" data-testid="resident-season">
      {w && (
        <li data-testid="resident-warmth" class={w.coldHours > 0 ? 'cold' : 'warm'}>
          {w.coldHours > 0
            ? `Cold for ${w.coldHours} ${w.coldHours === 1 ? 'hour' : 'hours'} today. Wants firewood at home.`
            : `Warm by the fire: ${w.burnedToday} firewood burned today.`}
          {w.coldDays > 0 && ` ${w.coldDays} cold ${w.coldDays === 1 ? 'day' : 'days'} this winter.`}
        </li>
      )}
      {watch && (
        <li data-testid="resident-watch">
          On the Watch.{' '}
          {watch.shaken
            ? 'A bit shaken after the last raid, and resting it off.'
            : `Next on duty ${dayName(watch.dutyDay)}.`}
        </li>
      )}
      {detail.reformed && (
        <li data-testid="resident-reformed">Reformed. Used to be a bandit; now mostly bakes.</li>
      )}
    </ul>
  );
}

export function BuildingSeasonLines({ session, detail }: { session: Session; detail: BuildingDetail }) {
  const { modules, hp, gate, flooded } = detail;
  if (!modules?.length && !hp && !gate && !flooded) return null;
  return (
    <div class="season-lines building" data-testid="building-season">
      {flooded && <p class="flooded">Under flood water. It will dry out once the river goes down.</p>}
      {hp && (
        <Meter
          label="Sturdiness"
          value={hp.now / Math.max(1, hp.max)}
          note={`${hp.now} of ${hp.max}`}
          tone="ochre"
          testid="building-hp"
        />
      )}
      {gate && (
        <p class="gate-line" data-testid="building-gate">
          The gate is {gate.open ? 'open' : 'shut'}.{' '}
          <button
            type="button"
            class="link-button"
            data-testid="gate-toggle"
            onClick={() => session.submit({ t: 'gate.set', id: detail.b.id, open: !gate.open })}
          >
            {gate.open ? 'Shut it' : 'Open it'}
          </button>
        </p>
      )}
      {modules && modules.length > 0 && (
        <p class="modules-line" data-testid="building-modules">
          Fitted with {modules.map(([, id]) => content.moduleById.get(id)?.name ?? id).join(', ')}.
        </p>
      )}
    </div>
  );
}
