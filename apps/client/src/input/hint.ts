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
  l.style.left = `${clientX + 16}px`;
  l.style.top = `${clientY + 18}px`;
  l.style.opacity = '1';
}
