// Player-facing strings for the title screen and chrome, in one place. Warm, dry, US spelling.

export const copy = {
  title: {
    name: 'City',
    nameAccent: 'Qoti',
    tagline: 'Two players, one valley, no rush.',
    welcome: [
      'The river has been waiting for company.',
      'Bring a friend. Bring a shovel. Mostly the friend.',
      'Somewhere out there, a cottage is waiting to be slightly crooked.',
    ],
    invited: 'Someone saved you a seat in their valley.',
    join: 'Join the valley',
    newOnline: 'New valley for two',
    newSolo: 'A quiet solo valley',
    options: 'Valley options',
    townName: 'Town name',
    townPlaceholder: 'Qoti',
    you: 'You',
    yourName: 'Your name',
    yourNamePlaceholder: 'What should the valley call you?',
    yourColor: 'Your color',
    more: 'More',
    seed: 'Seed',
    seedPlaceholder: 'Leave empty for a surprise',
    continue: 'Pick up where you left off',
    solo: 'Solo',
    online: 'For two',
    relayDown: 'Could not reach the relay. Is the dev server running?',
    openFile: 'Open a valley file (.qoti)',
    importedIn: 'in',
    importedResidents: (n: number) => (n === 1 ? '1 resident' : `${n} residents`),
    creative: 'Creative valley',
    creativeHint: 'no residents, no costs',
    creativeTag: 'Creative',
    economy: 'Economy',
    economyOptions: [
      ['gentle', 'Gentle', 'Forgiving books and patient builders.'],
      ['standard', 'Standard', 'The valley as it was meant to be.'],
      ['thoughtful', 'Thoughtful', 'Every plank is spoken for.'],
    ],
  },
  settings: {
    open: 'Settings',
    heading: 'Settings',
    quality: 'Picture quality',
    qualityLow: 'Gentle on the laptop',
    qualityMedium: 'Balanced',
    qualityHigh: 'Every leaf',
    uiScale: 'Interface size',
    reducedMotion: 'Calm motion',
    reducedMotionHint: 'Fewer wiggles and slides',
    keepCopy: 'Keep a copy',
    keepCopyHint: 'A .qoti file of this valley, for safekeeping or another laptop.',
    saveCopy: 'Save a valley file',
    // C4D: moving a solo valley online.
    together: 'Play together',
    togetherHint:
      'Move this valley online and invite someone to share it. Everything comes along: every lantern, every loaf, every opinion about the well.',
    moveOnline: 'Open it for two',
    moveSure: (town: string) =>
      `Move ${town} online? From now on it lives on the relay, and you get an invite link for your partner.`,
    moveYes: 'Move it online',
    moveNo: 'Not yet',
    moving: 'Packing up the valley...',
    moveFailed: 'The valley could not reach the relay. Nothing has moved; try again in a moment.',
    done: 'Done',
  },
  invite: {
    heading: 'Invite your partner',
    body: 'Send them this link. It opens the second seat of this valley, so keep it between the two of you.',
    copy: 'Copy link',
    copied: 'Copied. Off you go.',
    done: 'Done',
    missing:
      'The invite link lives on the device that created this valley. Ask your partner to send it again.',
    fine: 'Fine',
  },
  emotes: {
    open: 'Emote',
    hint: 'V opens the emote wheel',
    list: [
      ['wave', '\u{1F44B}', 'Wave'],
      ['heart', '\u{2764}\u{FE0F}', 'Heart'],
      ['laugh', '\u{1F604}', 'Laugh'],
      ['thumbs', '\u{1F44D}', 'Nice'],
      ['tea', '\u{1F375}', 'Tea break'],
      ['sparkle', '\u{2728}', 'Lovely'],
      ['sleepy', '\u{1F634}', 'Sleepy'],
      ['think', '\u{1F914}', 'Hmm'],
    ],
  },
  pingMenu: {
    look: 'Look here',
    help: 'Help',
    build: 'Build here',
  },
  presence: {
    partner: 'Your partner',
    goToPartner: 'Go to partner',
    goToPartnerHint: 'Glide over to wherever your partner is pottering',
  },
  help: {
    heading: 'How the valley works',
    footer: 'Press ? any time to bring this back.',
    rows: [
      ['Drag', 'Pan the valley'],
      ['Pinch or ctrl + scroll', 'Zoom'],
      ['Shift + drag', 'Rotate the view'],
      ['Tab', 'Swap between Hearth and Ledger'],
      ['Space', 'Pause or resume time'],
      ['1, 2, 3', 'Set your preferred speed'],
      ['Esc', 'Put the tool down'],
      ['Ctrl + Z', 'Undo your last change'],
      ['B, C, J, O', 'Pattern Book, Chronicle, Wishes, Letters'],
      ['L, M, P, N', 'Reports, Market, Policies, the notebook'],
      ['H', 'The Charter board'],
      ['V', 'Emote wheel'],
      ['?', 'This card'],
    ],
  },
} as const;

/** A welcome line that stays put for the whole visit. */
export function welcomeLine(seed = Math.random()): string {
  const lines = copy.title.welcome;
  return lines[Math.floor(seed * lines.length) % lines.length]!;
}
