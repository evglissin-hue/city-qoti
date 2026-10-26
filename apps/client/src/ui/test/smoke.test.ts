// @vitest-environment happy-dom
import { h, render } from 'preact';
import { useState } from 'preact/hooks';
import { expect, it } from 'vitest';

function C() {
  const [n, set] = useState(0);
  return h('button', { onClick: () => set(n + 1) }, `n${n}`);
}

it('renders', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(h(C, null), root);
  expect(root.textContent).toBe('n0');
  root.querySelector('button')!.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(root.textContent).toBe('n1');
});
