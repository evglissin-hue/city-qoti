// @vitest-environment happy-dom
import { signal } from '@preact/signals';
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
  measureMarkdown,
  measureSeconds,
  MEASURE_PRESETS,
  MEASURE_SCENES,
  perfTable,
  type PerfPart,
  type PerfRow,
} from '../../app/perf';
import type { Session } from '../../app/session';
import { mount, settle } from '../test/dom';
import { estimateText, MEASURE_COPY, MeasurePanel, MeasureTable, measureState, openMeasure } from './Measure';

const part = (frameAvg: number, gpu: number | null): PerfPart => ({
  frames: 100,
  frameAvg,
  frameP95: frameAvg * 1.5,
  gpuAvg: gpu,
  gpuP95: gpu === null ? null : gpu * 2,
  draws: 140,
  triangles: 1_250_000,
  modes: { moving: 1, still: 2, idle: 90 },
  shadowRenders: 1,
});

const rows: PerfRow[] = MEASURE_SCENES.flatMap((scene) =>
  MEASURE_PRESETS.map((quality, i) => ({ scene, quality, moving: part(10 + i, 4), idle: part(2, null) })),
);

const machine = {
  browser: 'Mozilla/5.0 test',
  screen: [1440, 900] as [number, number],
  pixelRatio: 2,
  gpu: 'Test GPU',
  build: 'abc-dev',
};

describe('Measure this laptop', () => {
  afterEach(() => {
    measureState.value = { k: 'closed' };
    document.body.innerHTML = '';
  });

  it('runs twelve rows: four presets in three scenes', () => {
    expect(rows).toHaveLength(12);
  });

  it('estimates a full run honestly, and a quick one as under a minute', () => {
    const full = measureSeconds();
    expect(full).toBeGreaterThan(4 * 60);
    expect(full).toBeLessThan(7 * 60);
    expect(estimateText(full)).toMatch(/^about [5-6] minutes$/);
    expect(estimateText(measureSeconds({ move: 1, rest: 1, settle: 0.5, settleMax: 4 }))).toBe(
      'under a minute',
    );
    expect(estimateText(80)).toBe('about a minute');
  });

  it('copies a line on the machine and the Markdown table', () => {
    const text = measureMarkdown(perfTable(rows), machine);
    const lines = text.split('\n');
    expect(lines[0]).toContain('Test GPU');
    expect(lines[0]).toContain('1440 x 900 at 2x');
    expect(lines[0]).toContain('build abc-dev');
    expect(text).toContain('| Scene | Preset | Moving frame ms (avg / p95) |');
    expect(lines.filter((l) => l.startsWith('| village |'))).toHaveLength(4);
  });

  it('shows the table: one row each, GPU n/a where the browser has no timer', async () => {
    const m = await mount(h(MeasureTable, { rows }));
    expect(m.root.querySelectorAll('[data-testid="measure-row"]')).toHaveLength(12);
    expect(m.text()).toContain('Village showcase');
    expect(m.text()).toContain('10.0 / 15.0');
    expect(m.text()).toContain('2.0 / 3.0n/a');
    expect(m.text()).not.toContain('n/a / n/a');
    expect(m.text()).toContain('1.25 M');
    m.unmount();
  });

  it('says n/a for a part that caught no frames, never zeros that look measured', async () => {
    const empty: PerfPart = { ...part(0, null), frames: 0, frameP95: 0, draws: 0, triangles: 0 };
    const m = await mount(h(MeasureTable, { rows: [{ ...rows[0]!, moving: empty, idle: empty }] }));
    const cells = [...m.root.querySelectorAll('[data-testid="measure-row"] td')].map((td) => td.textContent);
    expect(cells.slice(2)).toEqual(['n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a']);
    m.unmount();
  });

  it('asks first with the estimate, lists kept runs, and Escape closes the card', async () => {
    const session = {
      target: { valleyId: 'b'.repeat(32), seat: 0, token: 't', mode: 'solo' },
      seat: 0,
      renderer: null,
      mirror: { seats: signal([]) },
      ui: { settingsOpen: signal(true) },
    } as unknown as Session;
    openMeasure(session);
    expect(session.ui.settingsOpen.value).toBe(false);
    const m = await mount(h(MeasurePanel, { session }));
    expect(m.get('measure-estimate').textContent).toContain('minutes');
    expect(m.get('measure-estimate').textContent).toContain('comes back exactly as it was');
    expect(m.get('measure-kept').textContent).toContain(MEASURE_COPY.keptNone);
    // No valley on screen: nothing to measure yet.
    expect((m.get('measure-start') as HTMLButtonElement).disabled).toBe(true);
    await act(() => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await settle();
    expect(measureState.value.k).toBe('closed');
    expect(m.find('measure')).toBeNull();
    m.unmount();
  });

  it('writes no em dashes', () => {
    const all = Object.values(MEASURE_COPY)
      .map((v) => (typeof v === 'function' ? (v as (...a: string[]) => string)('x', 'y') : v))
      .join(' ');
    expect(all).not.toContain('—');
  });
});
