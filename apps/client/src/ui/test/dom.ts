// Tiny helpers for component tests under happy-dom: mount, settle and find by test id.
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';

export interface Mounted {
  root: HTMLElement;
  /** The element with this data-testid, or throws. */
  get(testid: string): HTMLElement;
  find(testid: string): HTMLElement | null;
  /** Visible text, whitespace collapsed. */
  text(): string;
  /** Clicks and lets effects, promises and re-renders settle. */
  click(target: string | Element): Promise<void>;
  unmount(): void;
}

/** Lets pending promises (inspect answers) and Preact re-renders run. */
export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

export async function mount(vnode: ComponentChild): Promise<Mounted> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  await act(() => {
    render(vnode, root);
  });
  await settle();
  const find = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const get = (id: string) => {
    const el = find(id);
    if (!el) throw new Error(`No [data-testid="${id}"] in: ${root.innerHTML.slice(0, 400)}`);
    return el;
  };
  return {
    root,
    get,
    find,
    text: () => (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
    click: async (target) => {
      const el = typeof target === 'string' ? get(target) : target;
      await act(() => {
        (el as HTMLElement).click();
      });
      await settle();
    },
    unmount: () => {
      render(null, root);
      root.remove();
    },
  };
}

/** The first button whose text includes `label`. */
export function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label));
  if (!found) throw new Error(`No button "${label}"`);
  return found;
}

/** I2 (C4F): types into an input or textarea as a player would, then lets Preact catch up. */
export async function typeInto(el: HTMLElement, value: string): Promise<void> {
  await act(() => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}
