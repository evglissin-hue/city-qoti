// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.

export interface ValleySettings {
  /** I0 creates sandbox valleys. */
  mode: 'sandbox' | 'standard';
  economy: 'gentle' | 'standard' | 'thoughtful';
  threat: 'peaceful' | 'standard' | 'fierce';
  /** Time passes only while both seats are connected. */
  togetherOnly: boolean;
  townName: string;
  valleyName: string;
  /** I3 (C5.0, C5H): show the first days guide (new standard valleys default to on). */
  guide?: boolean;
  /**
   * R2 (R2.0): the lingering evening (19-evenings.md, The day in two acts): from 17:00 to 21:00 the
   * clock runs at half the chosen speed. Absent means on; valley.setSettings may turn it off.
   */
  eveningLingers?: boolean;
}
