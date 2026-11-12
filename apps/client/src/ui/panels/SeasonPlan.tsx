// R1 (R1C): the season card asks the Ledger its questions (docs/spec/13-ledger.md, The season plan):
// the winter reserve (Food and Fuel apart if wanted), this season's deal and where to build first.
// Each answer goes alone through season.setPlan; the answers keep until changed.
import { content } from '@qoti/content';
import {
  WINTER_RESERVE_MAX,
  type DealOffer,
  type RankId,
  type SeasonPlan,
  type SeasonPlanInput,
} from '@qoti/sim';
import type { Session } from '../../app/session';
import { rankAtLeast } from '../village';
import './seasonPlan.css';

const FAMILY_WORD: Record<string, string> = {
  food: 'Food',
  fuel: 'Fuel',
  materials: 'Materials',
  wares: 'Wares',
  treats: 'Treats',
};

/** "Millhaven sells us Food at 110%" / "Stonecross buys our Fuel at 95%". */
export function dealWords(o: DealOffer): string {
  const who = content.neighborById.get(o.neighbor)?.name ?? o.neighbor;
  const what = FAMILY_WORD[o.family] ?? o.family;
  return o.side === 'buy'
    ? `${who} sells us ${what} at ${o.percent}% of their price`
    : `${who} buys our ${what} at ${o.percent}% of their price`;
}

/** The zones the builders may be sent to first, in demand order; Shops from Village rank. */
export function buildFirstChoices(rank: RankId | undefined): { id: string | null; word: string }[] {
  return [
    { id: 'homes-low', word: 'Homes' },
    ...(rankAtLeast(rank, 'village') ? [{ id: 'shops', word: 'Shops' }] : []),
    { id: 'crafts', word: 'Workshops' },
    { id: 'farms', word: 'Farmland' },
    { id: null, word: 'Anywhere' },
  ];
}

export function clampDays(n: number): number {
  return Math.max(0, Math.min(WINTER_RESERVE_MAX, n));
}

function Days({
  value,
  onChange,
  testid,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  testid: string;
  label: string;
}) {
  return (
    <span class="stepper" data-testid={testid} aria-label={label}>
      <button
        type="button"
        class="step"
        aria-label={`${label}: one day fewer`}
        disabled={value <= 0}
        onClick={() => onChange(clampDays(value - 1))}
      >
        −
      </button>
      <span class="step-value">
        {value} {value === 1 ? 'day' : 'days'}
      </span>
      <button
        type="button"
        class="step"
        aria-label={`${label}: one day more`}
        disabled={value >= WINTER_RESERVE_MAX}
        onClick={() => onChange(clampDays(value + 1))}
      >
        +
      </button>
    </span>
  );
}

/** The Ledger's questions, on the season card. Hidden until the plan is in the view. */
export function SeasonPlanQuestions({ session, winter }: { session: Session; winter: boolean }) {
  const m = session.mirror;
  const b = m.balances.value;
  if (!b || m.settings.value.mode !== 'standard') return null;
  const plan: SeasonPlan = b.plan;
  const send = (p: SeasonPlanInput) => session.submit({ t: 'season.setPlan', plan: p });
  const apart = plan.food !== null || plan.fuel !== null;
  const choices = buildFirstChoices(m.town.value?.rank);
  return (
    <section class="almanac-plan" data-testid="card-plan-questions">
      <h4>The Ledger's questions</h4>
      <div class="plan-q" data-testid="plan-reserve">
        <p>By the first day of {winter ? 'next winter' : 'winter'}, hold</p>
        <Days
          value={plan.reserve}
          label="The winter reserve"
          testid="plan-reserve-days"
          onChange={(n) => send({ reserve: n })}
        />
        <p>of {apart ? 'everything else' : 'everything'}.</p>
        <label class="plan-apart">
          <input
            type="checkbox"
            checked={apart}
            data-testid="plan-apart"
            onChange={() =>
              send(apart ? { food: null, fuel: null } : { food: plan.reserve, fuel: plan.reserve })
            }
          />
          Food and Fuel apart
        </label>
      </div>
      {apart && (
        <div class="plan-q plan-apart-row">
          <p>Food</p>
          <Days
            value={plan.food ?? plan.reserve}
            label="Food for winter"
            testid="plan-food-days"
            onChange={(n) => send({ food: n })}
          />
          <p>Fuel</p>
          <Days
            value={plan.fuel ?? plan.reserve}
            label="Fuel for winter"
            testid="plan-fuel-days"
            onChange={(n) => send({ fuel: n })}
          />
        </div>
      )}
      <div class="plan-q" data-testid="plan-deal">
        <p>This season's deal</p>
        {b.offers.length === 0 ? (
          <p class="small muted">No neighbor has an offer this season.</p>
        ) : (
          <div class="plan-choices" role="radiogroup" aria-label="This season's deal">
            {b.offers.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={plan.deal === o.id}
                class={`plan-choice ${plan.deal === o.id ? 'active' : ''}`}
                data-testid={`plan-deal-${o.id}`}
                onClick={() => send({ deal: o.id })}
              >
                {dealWords(o)}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={plan.deal === null}
              class={`plan-choice ${plan.deal === null ? 'active' : ''}`}
              data-testid="plan-deal-none"
              onClick={() => send({ deal: null })}
            >
              No deal
            </button>
          </div>
        )}
      </div>
      <div class="plan-q" data-testid="plan-build-first">
        <p>Where the builders go first</p>
        <div class="plan-choices" role="radiogroup" aria-label="Where the builders go first">
          {choices.map((c) => (
            <button
              key={c.word}
              type="button"
              role="radio"
              aria-checked={plan.buildFirst === c.id}
              class={`plan-choice ${plan.buildFirst === c.id ? 'active' : ''}`}
              data-testid={`plan-first-${c.id ?? 'anywhere'}`}
              onClick={() => send({ buildFirst: c.id })}
            >
              {c.word}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
