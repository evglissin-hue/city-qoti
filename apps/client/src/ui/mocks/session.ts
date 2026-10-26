// A session stand-in for component tests: a Mirror loaded with the hamlet mocks, UI state, a
// recorded submit and an inspect that answers with the mock details. Cast to Session for panels.
import {
  defaultSettings,
  type BuildingView,
  type Command,
  type InspectKind,
  type InspectResult,
  type ViewSnapshot,
} from '@qoti/sim';
import type { Session } from '../../app/session';
import type { RenderApi } from '../../render/api';
import { Mirror } from '../../state/mirror';
import { UndoStack } from '../../state/undo';
import { createUiState } from '../state';
import {
  mockAchievements,
  mockAwayLetter,
  mockBudget,
  mockBuildingDetail,
  mockBuildings,
  mockChronicle,
  mockHouseholds,
  mockPatterns,
  mockResidentDetail,
  mockResidents,
  mockStocks,
  mockTown,
  mockWishes,
} from './hamlet';

/** The three cottages and the well the mocks refer to by id, beside the mock buildings. */
const extraBuildings: BuildingView[] = [
  {
    id: 3,
    def: 'cottage',
    x: 53,
    z: 48,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
  },
  {
    id: 4,
    def: 'cottage',
    x: 56,
    z: 48,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
  },
  {
    id: 5,
    def: 'cottage',
    x: 62,
    z: 48,
    rot: 0,
    builtBy: 1,
    handmade: false,
    stage: 'built',
    foundation: false,
  },
  {
    id: 11,
    def: 'well',
    x: 57,
    z: 52,
    rot: 0,
    builtBy: 0,
    handmade: false,
    stage: 'built',
    foundation: false,
  },
];

/** A ViewSnapshot of the mock hamlet (flat empty layers; panels never read them). */
export function mockView(overrides: Partial<ViewSnapshot> = {}): ViewSnapshot {
  const blank = new Mirror();
  return {
    simVersion: 'mock',
    saveVersion: 2,
    size: blank.size,
    lastTurn: 3 * 4800,
    layers: blank.layers,
    buildings: [...mockBuildings, ...extraBuildings].sort((a, b) => a.id - b.id),
    decor: [],
    notes: [],
    seats: [
      {
        seat: 0,
        name: 'Ada',
        color: 0xd9a441,
        lens: 'hearth',
        connected: true,
        desiredSpeed: 1,
        lastSeenTick: 0,
      },
      {
        seat: 1,
        name: 'Bo',
        color: 0x3f7f7a,
        lens: 'ledger',
        connected: true,
        desiredSpeed: 1,
        lastSeenTick: 0,
      },
    ],
    settings: { ...defaultSettings(), mode: 'standard', economy: 'standard' },
    clock: { tick: 3 * 4800 + 1200, speed: 1, year: 1, season: 0, day: 4, hour: 12, minute: 0 },
    meta: { startArea: [40, 40, 63, 63], valleyGate: [0, 50], flow: 'ns' },
    residents: mockResidents,
    households: mockHouseholds,
    stocks: mockStocks,
    budget: mockBudget,
    wishes: mockWishes,
    patterns: mockPatterns,
    chronicle: mockChronicle,
    achievements: mockAchievements,
    town: mockTown,
    ...overrides,
  };
}

export function mockInspect(kind: InspectKind, id: number): InspectResult {
  if (kind === 'away') return { ...mockAwayLetter, seat: id as 0 | 1 };
  if (kind === 'resident') {
    const r = mockResidents.find((x) => x.id === id);
    if (!r) return null;
    return id === mockResidentDetail.r.id
      ? mockResidentDetail
      : {
          ...mockResidentDetail,
          r,
          wish: undefined,
          friends: [],
          bio: `A ${r.traits.join(' and ')} ${r.species}.`,
        };
  }
  const b = mockBuildings.find((x) => x.id === id) ?? extraBuildings.find((x) => x.id === id);
  if (!b) return null;
  return id === mockBuildingDetail.b.id ? mockBuildingDetail : { b, workers: [], status: [] };
}

export interface MockSession {
  session: Session;
  submitted: Command[];
  calls: { method: string; args: unknown[] }[];
}

/** A Session-shaped object for panels. `render` records highlight, focus and follow calls. */
export function mockSession(view: ViewSnapshot = mockView(), seat: 0 | 1 = 0): MockSession {
  const mirror = new Mirror();
  mirror.load(view);
  const ui = createUiState();
  const submitted: Command[] = [];
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return null;
    };
  const render = {
    focus: record('focus'),
    highlight: record('highlight'),
    follow: record('follow'),
    setOverlay: record('setOverlay'),
    setBubbles: record('setBubbles'),
  } as unknown as RenderApi;
  const undo = new UndoStack(seat);
  const session = {
    mirror,
    ui,
    seat,
    undo,
    render,
    renderer: null,
    tools: null,
    connection: null,
    target: { valleyId: 'mock', seat, token: 'mock', mode: 'solo' },
    submit: (cmd: Command) => {
      submitted.push(cmd);
      return submitted.length;
    },
    inspect: (kind: InspectKind, id: number) => Promise.resolve(mockInspect(kind, id)),
    toast: record('toast'),
    undoLast: record('undoLast'),
    myDesiredSpeed: () => 1,
    setSpeed: record('setSpeed'),
  } as unknown as Session;
  return { session, submitted, calls };
}
