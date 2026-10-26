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
}
