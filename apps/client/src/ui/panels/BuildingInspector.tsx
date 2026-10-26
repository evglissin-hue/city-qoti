import { content } from '@qoti/content';
import type { BuildingDetail, BuildingView } from '@qoti/sim';
import { useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { removeWithCare } from '../../input/removal';
import { buildingName, capital, coins, seatLabel } from '../format';
import { CATEGORY_WORD, CONSTRUCTION_STAGES, statusWords, TIER_WORD } from '../hamlet';
import { zoneInk } from '../village';
import { Price } from './villageParts';
import { Glyph } from '../icons';
import { Empty, Frame, GoodChip, GoodList, Heading, Meter, Toggle, useInspect } from './parts';

/**
 * A building's runtime: who works here and who is in, buffers and the current cycle, condition,
 * status in words, priority and pause, customization, and who built it.
 */
export function BuildingInspector({ session, id }: { session: Session; id: number }) {
  const m = session.mirror;
  void m.revision.value;
  void m.hamletRevision.value;
  const b = m.buildings.get(id);
  const detail = useInspect<BuildingDetail>((k, i) => session.inspect(k, i), 'building', id, b);
  if (!b) return null;
  const def = content.buildingById.get(b.def);
  const rt = b.rt;
  const seats = m.seats.value;
  const by = seatLabel(seats, b.builtBy, session.seat);
  const close = () => (session.ui.selection.value = null);
  const site = b.stage === 'construction' && rt?.construction;
  // The worker's words when it has any; the status bits the Mirror holds otherwise.
  const status = detail?.status.length ? detail.status : statusWords(rt?.status ?? 0);
  const household = detail?.household ?? findHousehold(session, b);
  const kicker = site ? 'Construction site' : (CATEGORY_WORD[def?.category ?? ''] ?? 'Building');

  return (
    <Frame
      id="building-inspector"
      class="inspector-panel building"
      kicker={kicker}
      title={signTitle(b) ?? def?.name ?? b.def}
      onClose={close}
    >
      {signTitle(b) && <p class="muted subtitle">{def?.name}</p>}
      {rt && (
        <p class={`status-line ${status.length ? 'warn' : 'ok'}`} data-testid="building-status">
          <i class="status-dot" />
          {status.length ? status.join('. ') + '.' : site ? 'Coming along nicely.' : quietLine(b)}
        </p>
      )}

      {site && rt?.construction && (
        <div class="site">
          <ol class="stages" aria-label="Construction stages">
            {CONSTRUCTION_STAGES.map((name, i) => (
              <li
                key={name}
                class={i < rt.construction!.stage ? 'done' : i === rt.construction!.stage ? 'now' : ''}
              >
                <i />
                <span>{name}</span>
              </li>
            ))}
          </ol>
          <Meter
            label="Progress"
            value={rt.construction.progress}
            note={`${Math.round(rt.construction.progress * 100)}%`}
            tone="ochre"
            testid="construction-progress"
          />
          <Heading>Materials</Heading>
          <Materials needs={rt.construction.needs} delivered={rt.construction.delivered} />
          <Toggle
            on={rt.construction.priority}
            label="Rush this one (porters and builders come here first)"
            testid="priority"
            onChange={(on) => session.submit({ t: 'build.setPriority', id: b.id, priority: on })}
          />
        </div>
      )}

      {!site && rt && (
        <>
          {rt.jobs > 0 && (
            <>
              <Heading>
                Workers{' '}
                <span class="muted">{`${rt.present} in, ${rt.workers} of ${rt.jobs} jobs filled`}</span>
              </Heading>
              {detail && detail.workers.length > 0 ? (
                <ul class="people workers">
                  {detail.workers.map((w) => (
                    <li key={w.id}>
                      <i
                        class={`presence ${w.present ? 'in' : 'out'}`}
                        title={w.present ? 'Here now' : 'Elsewhere'}
                      />
                      <button
                        type="button"
                        class="link"
                        onClick={() => (session.ui.selection.value = { kind: 'resident', id: w.id })}
                      >
                        {w.name}
                      </button>
                      <span class="muted">{w.present ? 'here' : 'out'}</span>
                    </li>
                  ))}
                </ul>
              ) : rt.workers === 0 ? (
                <Empty>Nobody yet. Someone will turn up when a household needs work.</Empty>
              ) : null}
              {rt.jobs > rt.workers && (
                <p class="muted small">
                  {rt.jobs - rt.workers} {rt.jobs - rt.workers === 1 ? 'job' : 'jobs'} open
                </p>
              )}
            </>
          )}
          {detail?.method && (
            <>
              <Heading>{detail.method.name}</Heading>
              <Meter
                value={rt.progress}
                note={`a cycle every ${detail.method.hours} ${detail.method.hours === 1 ? 'hour' : 'hours'}`}
                tone="sage"
                testid="production-progress"
              />
            </>
          )}
          {(rt.input.length > 0 || rt.output.length > 0) && (
            <div class="buffers">
              {rt.input.length > 0 && (
                <div>
                  <span class="label">In</span>
                  <GoodList items={rt.input} />
                </div>
              )}
              {rt.output.length > 0 && (
                <div>
                  <span class="label">Out</span>
                  <GoodList items={rt.output} />
                </div>
              )}
            </div>
          )}
          {!!def?.storage && (
            <>
              <Heading>
                Stores <span class="muted">{`${sum(rt.store)} of ${def.storage}`}</span>
              </Heading>
              <Meter value={sum(rt.store) / def.storage} tone="river" />
              <GoodList items={rt.store} empty="Empty shelves." />
            </>
          )}
          {detail?.served && (
            <p class="small">
              Serves {detail.served.residents} of {detail.served.capacity} residents nearby.
            </p>
          )}
          {rt.condition < 100 && (
            <Meter
              label="Condition"
              value={rt.condition / 100}
              note={`${Math.round(rt.condition)}%`}
              tone={rt.condition < 70 ? 'warn' : 'sage'}
            />
          )}
          {rt.jobs > 0 && (
            <Toggle
              on={rt.paused}
              label={rt.paused ? 'Paused (workers stay home)' : 'Pause work here'}
              testid="pause"
              onChange={(on) => session.submit({ t: 'build.setPaused', id: b.id, paused: on })}
            />
          )}
        </>
      )}

      {detail && <VillageDetail session={session} detail={detail} />}

      {household && (
        <>
          <Heading>Home of the {household.family} family</Heading>
          <ul class="people">
            {household.members.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  class="link"
                  onClick={() => (session.ui.selection.value = { kind: 'resident', id: p.id })}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p class="credit">
        <Glyph id="home" />
        <span>
          {capital(`built by ${by}`)}
          {b.handmade && <span class="handmade"> with a personal touch</span>}
          {b.foundation && ', on a stone plinth'}.
        </span>
      </p>
      {site && def?.cost?.coins ? (
        <p class="muted small">Removing a site refunds its {coins(def.cost.coins * 100)} in full.</p>
      ) : null}

      <div class="panel-actions">
        <button
          type="button"
          data-testid="customize-open"
          onClick={() => {
            session.ui.customize.value = b.id;
          }}
        >
          <Glyph id="customize" /> Customize
        </button>
        <button
          type="button"
          class="danger"
          data-testid="remove"
          onClick={() => {
            const thing = (def?.name ?? b.def).toLowerCase();
            const piece = { builtBy: b.builtBy, handmade: b.handmade, thing, x: b.x, z: b.z, building: true };
            void removeWithCare(session, piece, { t: 'build.remove', ids: [b.id] });
          }}
        >
          Remove
        </button>
      </div>
    </Frame>
  );
}

function sum(pairs: [string, number][]): number {
  return pairs.reduce((n, [, q]) => n + q, 0);
}

function signTitle(b: BuildingView): string | null {
  const sign = b.custom?.sign;
  return typeof sign === 'string' && sign.trim() ? sign.trim() : null;
}

function quietLine(b: BuildingView): string {
  const def = content.buildingById.get(b.def);
  if (b.rt?.paused) return 'Paused.';
  if (def?.housing) return 'A home, lived in.';
  if (!b.rt?.jobs) return 'Standing there being useful.';
  return 'Humming along.';
}

/** Needs still to come and delivered so far, as chips per good: delivered of total. */
function Materials({ needs, delivered }: { needs: [string, number][]; delivered: [string, number][] }) {
  const goods = new Map<string, { got: number; left: number }>();
  for (const [g, q] of delivered) goods.set(g, { got: q, left: 0 });
  for (const [g, q] of needs) goods.set(g, { got: goods.get(g)?.got ?? 0, left: q });
  if (!goods.size) return <Empty>Nothing more to bring.</Empty>;
  return (
    <div class="good-list materials">
      {[...goods].map(([g, { got, left }]) => (
        <GoodChip key={g} good={g} qty={got} of={got + left} />
      ))}
    </div>
  );
}

function findHousehold(session: Session, b: BuildingView) {
  for (const h of session.mirror.households.values()) {
    if (h.homeId !== b.id) continue;
    return {
      id: h.id,
      family: h.family,
      members: h.members.map((id) => {
        const r = session.mirror.residents.get(id);
        return { id, name: r ? `${r.given} ${r.family}` : 'Someone' };
      }),
    };
  }
  return undefined;
}

const STYLE_WORD: Record<string, string> = {
  timber: 'timber-framed',
  plaster: 'plastered',
  stone: 'stone-built',
  brick: 'red brick',
};

/**
 * I2 (C4F): what the village adds to a building: the lot it grew on and its style, a home's tier
 * and upgrade, the recipe the Ledger pinned, and (in the Ledger lens) its profit per work day.
 */
function VillageDetail({ session, detail }: { session: Session; detail: BuildingDetail }) {
  const [open, setOpen] = useState(false);
  const ledger = session.ui.lens.value === 'ledger';
  const b = detail.b;
  const lot = detail.lot;
  const zone = lot ? content.zoneById.get(lot.zone) : undefined;
  const style = b.style || lot?.style;
  return (
    <>
      {lot && (
        <p class="lot-line small" data-testid="building-lot">
          <i class="zone-dot" style={{ '--zone': zoneInk(lot.zone) }} />
          <span>
            Grew on a {(zone?.name ?? 'zoned').toLowerCase()} lot
            {style ? `, ${STYLE_WORD[style] ?? style}` : ''}.
            {lot.desirability > 0 && (
              <span class="muted">
                {' '}
                A {lot.desirability >= 60
                  ? 'sought-after'
                  : lot.desirability >= 35
                    ? 'decent'
                    : 'modest'}{' '}
                spot.
              </span>
            )}
          </span>
        </p>
      )}
      {detail.tier && (
        <p class="small" data-testid="building-tier">
          A {TIER_WORD[detail.tier]?.toLowerCase() ?? detail.tier} home.
        </p>
      )}
      {detail.upgrade && (
        <div class="upgrade" data-testid="building-upgrade">
          <Heading>Becoming a {buildingName(detail.upgrade.to).toLowerCase()}</Heading>
          <GoodList items={detail.upgrade.waiting} empty="Everything has arrived; the builders are on it." />
        </div>
      )}
      {detail.methods && detail.methods.length > 1 && (
        <div class="pin-recipe" data-testid="pin-recipe">
          <Heading>Makes</Heading>
          <div class="dial small village-dial" role="radiogroup" aria-label="Recipe">
            <button
              type="button"
              role="radio"
              aria-checked={!detail.pinned}
              class={!detail.pinned ? 'active' : ''}
              title="Whatever the market is shortest of"
              onClick={() => session.submit({ t: 'build.pinRecipe', id: b.id, method: null })}
            >
              Whatever is short
            </button>
            {detail.methods.map((mt) => (
              <button
                key={mt.id}
                type="button"
                role="radio"
                aria-checked={detail.pinned === mt.id}
                class={detail.pinned === mt.id ? 'active' : ''}
                data-testid={`pin-${mt.id}`}
                onClick={() => session.submit({ t: 'build.pinRecipe', id: b.id, method: mt.id })}
              >
                {mt.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {ledger && detail.profit && (
        <div
          class={`profit-card ${detail.profit.perDay >= 0 ? 'gain' : 'loss'}`}
          data-testid="building-profit"
        >
          <button type="button" class="profit-row" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span>{detail.profit.perDay >= 0 ? 'Earns its keep' : 'Runs at a loss'}</span>
            <b class={detail.profit.perDay >= 0 ? 'plus' : 'minus'}>
              {detail.profit.perDay >= 0 ? '+' : '−'}
              <Price pennies={Math.abs(detail.profit.perDay)} />
              <span class="muted small"> a work day</span>
            </b>
          </button>
          {open && (
            <div class="profit-lines">
              {detail.profit.lines.map((l) => (
                <p key={l.label}>
                  <span>{l.label}</span>
                  <span class={l.pennies >= 0 ? 'plus' : 'minus'}>
                    {l.pennies >= 0 ? '+' : '−'}
                    <Price pennies={Math.abs(l.pennies)} />
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
