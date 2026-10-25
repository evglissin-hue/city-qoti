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
      ['?', 'This card'],
    ],
  },
} as const;

/** A welcome line that stays put for the whole visit. */
export function welcomeLine(seed = Math.random()): string {
  const lines = copy.title.welcome;
  return lines[Math.floor(seed * lines.length) % lines.length]!;
}
