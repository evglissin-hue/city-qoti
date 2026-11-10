// Player-facing strings from the input tools, in one place (warm and dry, no em dashes).
export const INPUT_COPY = {
  removeTitle: (owner: string, thing: string) => `${owner} placed this ${thing} by hand.`,
  removeBuildingTitle: (owner: string, thing: string) =>
    `${owner} built this ${thing} and dressed it up by hand.`,
  removeBody: 'Remove it anyway? They will get a note saying so.',
  removeReason: 'Why? (optional, they will see this)',
  removeOk: 'Remove it',
  removeCancel: 'Keep it',
  removeNote: (me: string, thing: string, reason: string) =>
    reason ? `${me} removed your ${thing}: ${reason}` : `${me} removed your ${thing}. Nothing personal.`,
  partner: 'Your partner',
  someone: 'Someone',
  piece: 'piece',
  roadHint: 'F flips the bend. Esc lets go.',
  // I2 (C4F)
  streetLocked: (innovation: string) =>
    `Streets want ${innovation} first. Cut plenty of stone and the notebook will work it out.`,
  zoneLocked: 'Shops and Townhouses come with the Village Charter. The County likes its paperwork in order.',
  zoneHint: 'Drag a box to zone it. Shift+drag unzones.',
  zonePreview: (n: number, road: string) =>
    n === 0
      ? 'No road frontage here yet. Lots only grow along a lane or street.'
      : `Room for about ${n} ${n === 1 ? 'lot' : 'lots'} along the ${road}. The surveyor has the final say.`,
  /** Playtest round five: the building cursor always says how to turn it. */
  turnHint: 'R turns it; the arrow marks the door.',
  noRoadYet: 'No road at the door yet: it will want one.',
  /** Playtest round six: something new opened in the Build menu. */
  unlocked: (names: string[]) =>
    `New in the Build menu: ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}.`,
  /** Playtest item 5: the Earthworks tool and the building tool's pointer to it. */
  earthHint: 'Drag a box. Level matches the ground where you start; Raise and Lower move one level.',
  earthStart: (kind: 'level' | 'raise' | 'lower', height: number) =>
    kind === 'level'
      ? `Level to here (height ${height}): drag across the ground to match.`
      : `Drag a box to ${kind} it one level.`,
  earthSummary: (kind: 'level' | 'raise' | 'lower', tiles: number, coins: number | null) => {
    const verb = kind === 'level' ? 'Level' : kind === 'raise' ? 'Raise' : 'Lower';
    const what = `${verb} ${tiles} ${tiles === 1 ? 'tile' : 'tiles'}`;
    return coins === null ? what : `${what}: ${coins} coins`;
  },
  earthWhy: (
    why: 'water' | 'occupied' | 'locked' | 'limit' | 'cliff' | 'tooMuch' | 'flat',
    kind: 'level' | 'raise' | 'lower',
  ) => {
    switch (why) {
      case 'water':
        return 'Water will not be leveled. Keep to dry land.';
      case 'occupied':
        return 'Roads and buildings stay put: level around them.';
      case 'locked':
        return 'That ground is not yours yet.';
      case 'limit':
        return kind === 'lower'
          ? 'The valley goes no lower than that.'
          : 'The valley goes no higher than that.';
      case 'cliff':
        return 'That would leave a cliff at the edge: start from a spot nearer the ground around it, or take in a wider box.';
      case 'tooMuch':
        return 'That is a lot of digging for one go. A smaller box would do.';
      case 'flat':
        return 'Already flat. The spirit level is quietly pleased.';
    }
  },
  earthSteep: (coins: number | null) =>
    coins === null
      ? 'Earthworks (Ledger) can level it, and it is free in a sandbox.'
      : `Earthworks (Ledger) can level it for about ${coins} coins.`,
  sketched: (n: number) =>
    n === 1 ? 'Sketched. One idea on the table.' : `Sketched. ${n} ideas on the table.`,
} as const;
