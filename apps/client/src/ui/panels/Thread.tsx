// R3D: the Thread. One quiet sentence under an inspector's facts: where this thing came from and
// where it goes. Each name in it opens that thing; its route is drawn on the ground while it is
// open (or, on a place and a resident, while the pointer is over the sentence).
import type { ThreadSubject, ThreadView } from '@qoti/sim';
import { TICKS_PER_HOUR } from '@qoti/sim';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { setGroundLayer, tilePairs } from '../groundHighlight';
import { Glyph } from '../icons';
import './thread.css';

/**
 * Asks the worker for a Thread when the subject changes and when the hour turns (the counts move
 * with deliveries). Keeps the last answer while a new one is on its way, so the line never jumps.
 */
export function useThread(session: Session, subject: ThreadSubject): ThreadView | null {
  const [data, setData] = useState<ThreadView | null>(null);
  const hour = Math.floor(session.mirror.tick.value / TICKS_PER_HOUR);
  const key = JSON.stringify(subject);
  useEffect(() => {
    let live = true;
    void session.thread(JSON.parse(key) as ThreadSubject).then((value) => {
      if (live) setData(value);
    });
    return () => {
      live = false;
    };
  }, [key, hour]);
  // An answer for another subject is no answer: show nothing until the right one arrives.
  return data && JSON.stringify(data.subject) === key ? data : null;
}

const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);

/** Where a name sits in the text from `from`: a whole word when there is one, else the first match. */
function findName(text: string, name: string, from: number): number {
  let at = text.indexOf(name, from);
  const first = at;
  while (at >= 0) {
    if (!isLetter(text[at - 1]) && !isLetter(text[at + name.length])) return at;
    at = text.indexOf(name, at + 1);
  }
  return first;
}

/** The sentence cut at its refs' names, in order, each name a link. */
export function threadParts(
  text: string,
  refs: ThreadView['refs'],
  open: (ref: string) => void,
): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let cursor = 0;
  refs.forEach((r, i) => {
    if (!r.name) return;
    const at = findName(text, r.name, cursor);
    if (at < 0) return;
    if (at > cursor) out.push(text.slice(cursor, at));
    out.push(
      <button key={i} type="button" class="link" onClick={() => open(r.ref)}>
        {r.name}
      </button>,
    );
    cursor = at + r.name.length;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function Thread({
  session,
  subject,
  routeWhen,
}: {
  session: Session;
  subject: ThreadSubject;
  routeWhen: 'open' | 'hover';
}) {
  const view = useThread(session, subject);
  const [over, setOver] = useState(false);
  const routeKey = view && view.text ? view.route.join(',') : '';
  const show = !!routeKey && (routeWhen === 'open' || over);
  useEffect(() => {
    if (!show) return;
    setGroundLayer(session, 'thread', {
      tiles: tilePairs(routeKey.split(',').map(Number)),
      tone: 'ledger',
      path: true,
    });
    return () => setGroundLayer(session, 'thread', null);
  }, [show, routeKey]);
  // A hover that outlives its line must not leave the pointer state behind.
  useEffect(() => setOver(false), [routeKey === '']);
  if (!view || !view.text) return null;
  const open = (ref: string) => {
    const sep = ref.indexOf(':');
    const kind = sep > 0 ? ref.slice(0, sep) : '';
    const id = Number(ref.slice(sep + 1));
    if ((kind === 'building' || kind === 'resident') && Number.isFinite(id))
      session.ui.selection.value = { kind, id };
    else session.ui.selection.value = { kind: 'place', id: ref };
  };
  return (
    <p
      class="thread"
      data-testid="thread"
      title="Where it came from and where it goes, from what moved lately."
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      onFocusIn={() => setOver(true)}
      onFocusOut={() => setOver(false)}
    >
      <Glyph id="thread" />
      {threadParts(view.text, view.refs, open)}
    </p>
  );
}
