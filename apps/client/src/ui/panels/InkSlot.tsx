// V4B: a book's picture slot (240 x 180 CSS px, landscape 4:3): the valley in ink and wash, asked
// for only once the slot is on show (never while its card waits hidden in the queue) (app/inkPictures.ts). Until the picture comes, or where there is
// no renderer to take one, the slot shows what the page drew before (its line drawing).
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { useInkPicture } from '../../app/inkPictures';
import type { SeasonRender } from '../../app/snapshots';
import type { RenderApi } from '../../render/api';

/** Whether this renderer can take ink pictures at all. */
export function canInk(render: RenderApi | null): boolean {
  return typeof (render as SeasonRender | null)?.capture === 'function';
}

export function InkSlot({
  render,
  pictureKey,
  ask,
  label,
  testid,
  children,
}: {
  render: RenderApi | null;
  /** What the slot shows (a page id); null asks for nothing. */
  pictureKey: string | null;
  ask: () => Promise<string | null>;
  /** Said to a screen reader: what the picture is of. */
  label: string;
  testid: string;
  /** Shown while the picture develops, or always where no picture can be taken. */
  children?: ComponentChildren;
}) {
  const on = canInk(render) && pictureKey !== null;
  const ref = useRef<HTMLElement>(null);
  const url = useInkPicture(on ? pictureKey : null, ask, () => ref.current);
  if (!on) return <>{children}</>;
  return (
    <figure ref={ref} class={`ink-slot ${url ? 'ready' : 'developing'}`} data-testid={testid}>
      {url ? <img src={url} alt={label} /> : <div class="ink-slot-wait">{children}</div>}
    </figure>
  );
}
