// A MapReader with one piece left out, so a move can ask "may it stand there?" without the piece
// blocking itself. The sim's move commands and the client's Move ghost both use it, so the ghost
// says what the sim will say.
import type { EntityId, MapReader } from '../contracts';

export interface Leave {
  /** A building whose tiles read as free. */
  building?: EntityId;
  /** A decor piece that is not counted as near anything. */
  decor?: EntityId;
}

export function readerWithout(reader: MapReader, leave: Leave): MapReader {
  const { building, decor } = leave;
  return {
    ...reader,
    occupant: (x, z) => {
      const o = reader.occupant(x, z);
      return building !== undefined && o === building ? 0 : o;
    },
    decorNear: (fx, fz, radius) => {
      const near = reader.decorNear(fx, fz, radius);
      return decor === undefined ? near : near.filter((d) => d.id !== decor);
    },
  };
}
