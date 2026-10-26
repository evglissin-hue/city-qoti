import { content } from '@qoti/content';
import { treeSpecies, treeStage, type SeatId } from '@qoti/sim';
import type { Session } from '../../app/session';
import { BuildingInspector } from './BuildingInspector';
import { ResidentInspector } from './ResidentInspector';

const TERRAIN_NAMES = ['Grass', 'Meadow', 'Forest floor', 'Sand', 'Rock', 'Mountain', 'Water', 'Field'];
const SPECIES = ['', 'Oak', 'Birch', 'Pine'];
const STAGES = ['sapling', 'young', 'grown', 'mature'];

function seatName(session: Session, seat: SeatId): string {
  if (seat === session.seat) return 'you';
  return session.mirror.seats.value.find((s) => s.seat === seat)?.name ?? `Player ${seat + 1}`;
}

/** What is selected, who made it, and a way to remove it. */
export function InspectorPanel({ session }: { session: Session }) {
  const sel = session.ui.selection.value;
  void session.mirror.revision.value;
  if (!sel) return null;
  // I1: buildings and residents have their own inspectors.
  if (sel.kind === 'building') return <BuildingInspector key={sel.id} session={session} id={sel.id} />;
  if (sel.kind === 'resident') return <ResidentInspector key={sel.id} session={session} id={sel.id} />;
  const m = session.mirror;
  let title = '';
  const lines: string[] = [];
  let remove: (() => void) | null = null;

  if (sel.kind === 'decor') {
    const d = m.decor.get(sel.id);
    if (!d) return null;
    title = content.decorById.get(d.def)?.name ?? d.def;
    lines.push(`Placed by hand by ${seatName(session, d.builtBy)}.`);
    remove = () => session.submit({ t: 'decor.remove', ids: [d.id] });
  } else if (sel.kind === 'note') {
    const n = m.notes.get(sel.id);
    if (!n) return null;
    title = 'Note';
    lines.push(`"${n.text}"`, `Pinned by ${seatName(session, n.by)}.`);
    remove = () => session.submit({ t: 'note.remove', id: n.id });
  } else if (sel.kind === 'tree') {
    const v = m.tree(sel.x, sel.z);
    if (!v) return null;
    title = SPECIES[treeSpecies(v)] ?? 'Tree';
    lines.push(`A ${STAGES[treeStage(v)] ?? ''} tree.`);
    remove = () => session.submit({ t: 'tree.remove', tiles: [[sel.x, sel.z]] });
  } else if (sel.kind === 'tile') {
    title = TERRAIN_NAMES[m.terrain(sel.x, sel.z)] ?? 'Ground';
    lines.push(
      `Tile ${sel.x}, ${sel.z}. Level ${m.height(sel.x, sel.z)}, fertility ${m.fertility(sel.x, sel.z)}.`,
    );
    if (m.road(sel.x, sel.z))
      lines.push(m.road(sel.x, sel.z) === 1 ? 'A path runs here.' : 'A lane runs here.');
  }

  return (
    <section class="panel inspector" data-testid="inspector">
      <header>
        <h3>{title}</h3>
        <button type="button" class="close" title="Close" onClick={() => (session.ui.selection.value = null)}>
          ×
        </button>
      </header>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {remove && (
        <button type="button" class="danger" onClick={remove}>
          Remove
        </button>
      )}
    </section>
  );
}
