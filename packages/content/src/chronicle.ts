import type { ChronicleTemplate } from './types';

// Chronicle templates for the I1 kinds (docs/spec/12-hearth.md). One variant is picked with the
// sim's 'misc' stream, so both laptops write the same words. {placeholders} come from params.

export const achievement: ChronicleTemplate = {
  kind: 'achievement',
  text: ['{town} earned a plaque for the Town Hall: {achievement}.'],
  notable: true,
};

export const firstOf: ChronicleTemplate = {
  kind: 'first-of',
  text: ['The first {good} in {town}. Someone kept a piece, just to look at.'],
  notable: true,
};

export const founding: ChronicleTemplate = {
  kind: 'founding',
  text: ["{town} was founded in {valley}, on a {season} morning with mud on everyone's boots."],
  notable: true,
};

export const householdArrived: ChronicleTemplate = {
  kind: 'household-arrived',
  text: ['The {family} family arrived through the valley gate and moved into {place}.'],
  notable: true,
};

export const householdLeft: ChronicleTemplate = {
  kind: 'household-left',
  text: [
    "The {family} family packed up and left {town}. They said it wasn't personal. It was a little personal.",
  ],
  notable: true,
};

export const patternDiscovered: ChronicleTemplate = {
  kind: 'pattern-discovered',
  text: ['A new page in the Pattern Book: {pattern}, found {place}.'],
  notable: true,
};

export const seasonSummary: ChronicleTemplate = {
  kind: 'season-summary',
  text: ['{season} ended with {residents} residents and {coins} coins in the treasury.'],
  notable: true,
};

export const wishesDigest: ChronicleTemplate = {
  kind: 'wishes-digest',
  text: ['This week {count} wishes came true, among them {examples}.'],
};
