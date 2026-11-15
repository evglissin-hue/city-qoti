// Cards the Build pickers share: a piece's portrait, its cost, and one building as a card.
import type { BuildingDef } from '@qoti/content';
import type { Session } from '../app/session';
import { costBlock, type BuildingLock } from '../input/catalog';
import { thumbnail, type ThumbnailKind } from '../render/thumbnails';
import { goodName, thousands } from './format';
import { Glyph } from './icons';
import { rejectText } from './messages';
import { buildingPurpose } from './purpose';
import { siteRuleLine } from './siteRule';

export function CostLine({
  coins,
  goods,
  free,
}: {
  coins?: number;
  goods?: [string, number][];
  free: boolean;
}) {
  if (free) return <span class="cost muted">Free in a creative valley</span>;
  if (!coins && !goods?.length) return <span class="cost muted">No cost</span>;
  return (
    <span class="cost">
      {coins ? (
        <span class="coins">
          <Glyph id="coin" />
          {thousands(coins)}
        </span>
      ) : null}
      {goods?.map(([g, q]) => (
        <span key={g} class="mat">
          {q} {goodName(g).toLowerCase()}
        </span>
      ))}
    </span>
  );
}

/** A card's little portrait of the piece, drawn from its art kit (blank until it is ready). */
export function Thumb({ kind, id }: { kind: ThumbnailKind; id: string }) {
  const url = thumbnail(kind, id).value;
  return <span class="thumb">{url && <img src={url} alt="" draggable={false} />}</span>;
}

/**
 * One building in the picker: portrait, name, cost; greyed with its reason while locked. On the
 * Specialized shelf (`site`) it also says where it may stand and what it is for.
 */
export function BuildCard({
  session,
  def: d,
  lock,
  on,
  free,
  site = false,
}: {
  session: Session;
  def: BuildingDef;
  lock: BuildingLock | null;
  on: boolean;
  free: boolean;
  site?: boolean;
}) {
  const m = session.mirror;
  const blocked = free || lock ? null : costBlock(m, d.cost);
  const title = [lock?.text ? `${lock.text}.` : '', blocked ? rejectText(blocked) : '', buildingPurpose(d)]
    .filter(Boolean)
    .join(' ');
  const rule = site ? siteRuleLine(d) : null;
  return (
    <button
      type="button"
      class={`card ${on ? 'active' : ''} ${blocked ? 'short' : ''} ${lock ? 'locked' : ''} ${site ? 'site' : ''}`}
      data-testid={`variant-${d.id}`}
      title={title}
      disabled={!!lock}
      onClick={() => session.tools?.select('building', d.id)}
    >
      <Thumb kind="building" id={d.id} />
      <span class="card-text">
        <strong>{d.name}</strong>
        {rule && (
          <span class="site-rule" data-testid={`site-${d.id}`}>
            {rule}
          </span>
        )}
        {lock ? (
          <span class="lock-why muted">{lock.text}</span>
        ) : (
          <>
            {site ? (
              <span class="purpose muted">{buildingPurpose(d)}</span>
            ) : (
              <span class="size">
                {d.size[0]} × {d.size[1]}
                {!free && d.jobs ? `, ${d.jobs.count} ${d.jobs.count === 1 ? 'job' : 'jobs'}` : ''}
                {!free && d.housing ? `, homes ${d.housing.residents}` : ''}
              </span>
            )}
            <CostLine coins={d.cost?.coins} goods={d.cost?.goods} free={free} />
            {!free && d.upkeep ? <span class="upkeep muted">{d.upkeep} a day to keep</span> : null}
          </>
        )}
      </span>
    </button>
  );
}
