// What a decor piece does for the workplaces beside it, in words, for the picker card and the
// building inspector (playtest round seven; content DecorDef.boost).
import { content, type DecorDef } from '@qoti/content';

/** "a sawpit, quarry or smithy": the buildings a boost names (ids or tags), by name. */
function targetList(tags: readonly string[]): string {
  const names = tags.map((t) => {
    const def = content.buildingById.get(t);
    return (def?.name ?? t).toLowerCase();
  });
  if (names.length <= 1) return `a ${names[0] ?? 'workplace'}`;
  return `a ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** "+6% work at a sawpit or quarry within 2 tiles", or null for a piece that boosts nothing. */
export function boostText(def: DecorDef): string | null {
  const b = def.boost;
  if (!b) return null;
  const pct = Math.round(b.permille / 10);
  return `+${pct}% work at ${targetList(b.tags)} within ${b.radius} ${b.radius === 1 ? 'tile' : 'tiles'}`;
}

/** The inspector's line for a building with decor helping it. */
export function decorBoostLine(permille: number, pieces: readonly string[]): string {
  const names = pieces.map((id) => (content.decorById.get(id)?.name ?? id).toLowerCase());
  const list =
    names.length <= 1
      ? (names[0] ?? 'decor')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `+${Math.round(permille / 10)}% work from the ${list} nearby`;
}
