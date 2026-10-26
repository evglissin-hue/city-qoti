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
} as const;
