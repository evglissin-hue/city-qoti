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
  zoneLocked: 'Zoning comes with the Village Charter. The County likes its paperwork in order.',
  zoneHint: 'Drag a box to zone it. Shift+drag unzones.',
  zonePreview: (n: number, road: string) =>
    n === 0
      ? 'No road frontage here yet. Lots only grow along a lane or street.'
      : `Room for about ${n} ${n === 1 ? 'lot' : 'lots'} along the ${road}. The surveyor has the final say.`,
  /** Playtest round five: the building cursor always says how to turn it. */
  turnHint: 'R turns it; the arrow marks the door.',
  noRoadYet: 'No road at the door yet: it will want one.',
  sketched: (n: number) =>
    n === 1 ? 'Sketched. One idea on the table.' : `Sketched. ${n} ideas on the table.`,
} as const;
