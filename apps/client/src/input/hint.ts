// A small label that follows the cursor and says why a ghost cannot go where it is.
let el: HTMLDivElement | null = null;

function label(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (!el) {
    el = document.createElement('div');
    el.className = 'panel cursor-hint';
    el.setAttribute('role', 'status');
    el.dataset.testid = 'cursor-hint';
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '40',
      padding: '3px 8px',
      fontSize: '13px',
      whiteSpace: 'nowrap',
      transition: 'opacity 120ms ease',
      opacity: '0',
    });
    document.body.appendChild(el);
    // Playtest round six: the label never outstays the pointer. It goes once the pointer is over
    // the interface rather than the valley, and when the wheel moves the camera under it.
    const hide = () => {
      if (el) el.style.opacity = '0';
    };
    document.addEventListener(
      'pointermove',
      (e) => {
        if (!(e.target instanceof HTMLCanvasElement)) hide();
      },
      { capture: true, passive: true },
    );
    document.addEventListener('wheel', hide, { capture: true, passive: true });
  }
  return el;
}

/** Shows `text` just below and right of the cursor, or hides the label when text is null. */
export function cursorHint(text: string | null, clientX = 0, clientY = 0): void {
  const l = label();
  if (!l) return;
  if (!text) {
    l.style.opacity = '0';
    return;
  }
  if (l.textContent !== text) l.textContent = text;
  // R2D: a long hint near the right or bottom edge flips to the cursor's other side, so it is read
  // whole rather than cut off by the window ("Kept for strolling from 17:00 to 21:00. The Tow...").
  const w = l.offsetWidth;
  const h = l.offsetHeight;
  const vw = typeof window === 'undefined' ? Infinity : window.innerWidth;
  const vh = typeof window === 'undefined' ? Infinity : window.innerHeight;
  const left = clientX + 16 + w > vw - 8 ? Math.max(8, clientX - 12 - w) : clientX + 16;
  const top = clientY + 18 + h > vh - 8 ? Math.max(8, clientY - 12 - h) : clientY + 18;
  l.style.left = `${left}px`;
  l.style.top = `${top}px`;
  l.style.opacity = '1';
}
