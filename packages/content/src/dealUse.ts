// Playtest item 9: how much of each good a resident goes through in a day, in units. The Trade
// book's one-click deals use it to size an order when yesterday's consumption says nothing (a
// good the town has not used yet, or one it only builds with). Rough on purpose: a deal is a
// starting point the post keeps adjusting, not a forecast. Goods not listed use `dealUseDefault`.

export const dealUse: Readonly<Record<string, number>> = {
  apples: 0.3,
  bread: 0.5,
  bricks: 0.15,
  candles: 0.1,
  cheese: 0.3,
  cider: 0.15,
  clay: 0.15,
  coats: 0.05,
  firewood: 0.4,
  fish: 0.4,
  flour: 0.3,
  furniture: 0.03,
  honey: 0.1,
  logs: 0.4,
  milk: 0.3,
  pies: 0.15,
  planks: 0.3,
  stone: 0.3,
  tools: 0.05,
  vegetables: 0.4,
  wheat: 0.3,
  wool: 0.15,
};

export const dealUseDefault = 0.2;
