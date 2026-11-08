// The price rule (docs/spec/13-ledger.md, Market and prices), pure integer arithmetic so both
// players' browsers land on the same penny. Cover c = S / max(1, D) days against the target
// T = 3; the multiplier m(c / T) comes from PRICE_CURVE by linear interpolation; each day the
// price moves a quarter of the way to base x m, clamped to 0.4x to 3x base.
import { PRICE_CLAMP, PRICE_CURVE, PRICE_SMOOTHING, TARGET_COVER } from '../../constants';

/** Cover in hundredths of a day: 100 x stock / max(1, demand). */
export function coverOf(stock: number, demand: number): number {
  return Math.floor((100 * Math.max(0, stock)) / Math.max(1, demand));
}

/**
 * The curve's multiplier in hundredths for a cover in hundredths of a day. Below the first point
 * and above the last the curve holds flat (2.5x at a quarter of the target, 0.5x from 8x).
 */
export function multiplierFor(cover: number): number {
  // ratio = c / T in hundredths, kept exact by scaling the curve points instead of dividing.
  const first = PRICE_CURVE[0]!;
  if (cover <= first[0] * TARGET_COVER) return first[1];
  for (let i = 1; i < PRICE_CURVE.length; i++) {
    const [x1, y1] = PRICE_CURVE[i]!;
    if (cover > x1 * TARGET_COVER) continue;
    const [x0, y0] = PRICE_CURVE[i - 1]!;
    const span = (x1 - x0) * TARGET_COVER;
    const into = cover - x0 * TARGET_COVER;
    return y0 + Math.round(((y1 - y0) * into) / span);
  }
  return PRICE_CURVE[PRICE_CURVE.length - 1]![1];
}

/** Where today's cover pulls the price: base x m, clamped, pennies. */
export function targetPrice(base: number, cover: number): number {
  return clampPrice(base, Math.round((base * multiplierFor(cover)) / 100));
}

export function clampPrice(base: number, price: number): number {
  const lo = Math.ceil((base * PRICE_CLAMP[0]) / 100);
  const hi = Math.floor((base * PRICE_CLAMP[1]) / 100);
  return Math.max(lo, Math.min(hi, price));
}

/** One day's step: a quarter of the way from `price` to `target`, at least a penny, clamped. */
export function stepPrice(base: number, price: number, target: number): number {
  const gap = target - price;
  if (gap === 0) return clampPrice(base, price);
  let step = Math.round((gap * PRICE_SMOOTHING) / 100);
  if (step === 0) step = gap > 0 ? 1 : -1;
  return clampPrice(base, price + step);
}
