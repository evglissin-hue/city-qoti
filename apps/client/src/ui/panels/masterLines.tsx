// R3D: masters, apprentices, the craft, the lamplighter and a home's candle as quiet lines, shown only
// when the sim sends the field (R3A to R3C). Names are links, as everywhere in the inspectors.
import { content } from '@qoti/content';
import type { BuildingDetail, ResidentDetail } from '@qoti/sim';
import type { ComponentChildren } from 'preact';
import type { Session } from '../../app/session';
import { Glyph } from '../icons';
import './masters.css';

/** What a trade's days are called mid-sentence ("34 days at baking"). Anything else falls back to its name. */
const CRAFT_WORD: Record<string, string> = {
  baker: 'baking',
  carpenter: 'carpentry',
  chandler: 'candle making',
  'cider-maker': 'cider making',
  dairy: 'cheese making',
  fishery: 'fishing',
  'foresters-lodge': 'forestry',
  'grain-farm': 'farming grain',
  hives: 'beekeeping',
  'market-garden': 'gardening',
  orchard: 'orcharding',
  quarry: 'quarrying',
  'sheep-run': 'shepherding',
  shop: 'shopkeeping',
  weaver: 'weaving',
  windmill: 'milling',
};

export function craftWord(trade: string): string {
  return (
    CRAFT_WORD[trade] ??
    (content.tradeById.get(trade)?.name ?? content.buildingById.get(trade)?.name ?? trade).toLowerCase()
  );
}

/** "34 days at baking, 6 at milling." from the craft, most days first, at most two trades; null when none. */
export function craftLine(craft: ResidentDetail['craft']): string | null {
  const list = (craft ?? [])
    .filter((c) => c.days > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 2);
  if (!list.length) return null;
  const words = list.map(
    (c, i) => `${c.days}${i === 0 ? (c.days === 1 ? ' day' : ' days') : ''} at ${craftWord(c.trade)}`,
  );
  return `${words.join(', ')}.`;
}

export function capitalFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Named = { id: number; name: string };

export function PersonLink({ session, p }: { session: Session; p: Named }) {
  return (
    <button
      type="button"
      class="link"
      onClick={() => (session.ui.selection.value = { kind: 'resident', id: p.id })}
    >
      {p.name}
    </button>
  );
}

/** Links joined as "Fig and Tansy" or "Fig, Tansy and Wren". */
export function PeopleLinks({ session, list }: { session: Session; list: Named[] }) {
  return (
    <>
      {list.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === list.length - 1 ? ' and ' : ', ')}
          <PersonLink session={session} p={p} />
        </span>
      ))}
    </>
  );
}

/** The master's title for the trade a master works, from the Mirror's businesses: undefined if unknown. */
function titleOfMaster(session: Session, masterId: number): string | undefined {
  for (const b of session.mirror.businesses.values()) {
    if (b.masterId === masterId) return content.masterByOf.get(b.trade ?? b.def)?.title;
  }
  return undefined;
}

/** A resident's master title, apprenticeship and craft: up to three quiet lines. */
export function ResidentMasterLines({ session, detail }: { session: Session; detail: ResidentDetail }) {
  const { master, apprenticeOf } = detail;
  const craft = master ? null : craftLine(detail.craft);
  if (!master && !apprenticeOf && !craft) return null;
  const title = apprenticeOf ? titleOfMaster(session, apprenticeOf.id) : undefined;
  return (
    <div class="master-lines muted small" data-testid="resident-master-lines">
      {master && <p data-testid="resident-master">{capitalFirst(master.title)}.</p>}
      {apprenticeOf && (
        <p data-testid="resident-apprentice">
          Apprenticed to <PersonLink session={session} p={apprenticeOf} />
          {title ? `, ${title}` : ''}.
        </p>
      )}
      {craft && <p data-testid="resident-craft">{craft}</p>}
    </div>
  );
}

/** A building's master and apprentices, the Town Hall's lamplighter and a home's candle. */
export function BuildingMasterLines({ session, detail }: { session: Session; detail: BuildingDetail }) {
  const { master, lamplighter: lamp, candle } = detail;
  if (!master && !lamp && candle === undefined) return null;
  const open = lamp ? Math.max(0, lamp.jobs - lamp.held.length) : 0;
  return (
    <div class="master-lines small" data-testid="building-master-lines">
      {master && (
        <>
          <p data-testid="building-master">
            Master: <PersonLink session={session} p={master} />, {master.title}.
          </p>
          {master.apprentices.length > 0 && (
            <p data-testid="building-apprentices">
              Apprentices: <PeopleLinks session={session} list={master.apprentices} />.
            </p>
          )}
        </>
      )}
      {lamp && (
        <>
          <p data-testid="building-lamplighter">
            {lamp.held.length > 0 ? (
              <>
                {lamp.held.length === 1 ? 'Lamplighter: ' : 'Lamplighters: '}
                <PeopleLinks session={session} list={lamp.held} />.
              </>
            ) : null}
            {open > 0 && (lamp.held.length > 0 ? ' ' : '')}
            {open > 0 && openJobs(lamp.jobs, open)}
          </p>
          {lamp.lanterns > 0 && (
            <p data-testid="building-lanterns">
              Tonight: {lamp.lanterns} {lamp.lanterns === 1 ? 'lantern' : 'lanterns'}
              {lamp.candles > 0 ? `, ${lamp.candles} ${lamp.candles === 1 ? 'candle' : 'candles'}` : ''}.
            </p>
          )}
        </>
      )}
      {candle !== undefined && candle > 0 && (
        <p data-testid="building-candle">
          Candlelight for {candle === 1 ? 'one more night' : `${candle} more nights`}.
        </p>
      )}
    </div>
  );
}

function openJobs(jobs: number, open: number): ComponentChildren {
  if (jobs <= 1) return "The lamplighter's job is open.";
  return `${open === 1 ? 'One' : open} of ${jobs} lamplighter jobs ${open === 1 ? 'is' : 'are'} open.`;
}

/** The earned callings: name, icon and blurb from content; nothing when none is earned. */
export function Callings({ callings }: { callings: { id: string; name: string }[] | undefined }) {
  if (!callings?.length) return null;
  return (
    <div class="charter-callings" data-testid="charter-callings">
      <p class="label">Callings</p>
      <ul>
        {callings.map((c) => {
          const def = content.callingById.get(c.id);
          return (
            <li key={c.id} data-testid={`calling-${c.id}`}>
              {def?.icon ? <Glyph id={def.icon} /> : <span />}
              <p>
                <b>{def?.name ?? c.name}</b>
              </p>
              {def?.blurb && <p class="muted small">{def.blurb}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
