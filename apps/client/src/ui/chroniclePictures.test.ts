import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, type ChronicleEntryView } from '@qoti/sim';
import { chroniclePictures, oncePerBook, townBookPictured } from './chroniclePictures';

function entry(id: number, day: number, snap?: [number, number, number]): ChronicleEntryView {
  return {
    id,
    tick: day * TICKS_PER_DAY + 100,
    kind: 'first-of',
    text: `entry ${id}`,
    ...(snap ? { snapshot: { focus: [snap[0], snap[1]] as [number, number], radius: snap[2] } } : {}),
  } as ChronicleEntryView;
}
const urls = (...pairs: [number, string][]) => new Map(pairs);
const keys = (m: Map<number, string>) => [...m.keys()];

describe('V4X: chroniclePictures never repeats a picture in a row', () => {
  it('drops the same URL twice', () => {
    const out = chroniclePictures(
      [entry(2, 3, [10, 10, 12]), entry(1, 2, [40, 40, 12])],
      urls([2, 'u'], [1, 'u']),
    );
    expect(keys(out)).toEqual([2]);
  });

  it('drops the same aim on the same day', () => {
    const out = chroniclePictures(
      [entry(3, 3, [10, 10, 12]), entry(2, 3, [11, 9.5, 13])],
      urls([3, 'a'], [2, 'b']),
    );
    expect(keys(out)).toEqual([3]);
  });

  it('keeps the same aim days apart', () => {
    const out = chroniclePictures(
      [entry(3, 5, [10, 10, 12]), entry(2, 3, [10, 10, 12])],
      urls([3, 'a'], [2, 'b']),
    );
    expect(keys(out)).toEqual([3, 2]);
  });

  it('keeps different places on the same day', () => {
    const far = chroniclePictures(
      [entry(3, 3, [10, 10, 12]), entry(2, 3, [30, 10, 12])],
      urls([3, 'a'], [2, 'b']),
    );
    expect(keys(far)).toEqual([3, 2]);
    const wide = chroniclePictures(
      [entry(3, 3, [10, 10, 12]), entry(2, 3, [10, 10, 20])],
      urls([3, 'a'], [2, 'b']),
    );
    expect(keys(wide)).toEqual([3, 2]);
  });

  it('compares with the last picture shown, across entries that have none', () => {
    const list = [entry(4, 3, [10, 10, 12]), entry(3, 3), entry(2, 3), entry(1, 3, [10, 10, 12])];
    expect(keys(chroniclePictures(list, urls([4, 'a'], [1, 'b'])))).toEqual([4]);
  });

  it('keeps comparing with the one shown when a repeat is dropped', () => {
    const three = chroniclePictures(
      [entry(3, 3, [10, 10, 12]), entry(2, 3, [10, 10, 12]), entry(1, 3, [10, 10, 12])],
      urls([3, 'a'], [2, 'b'], [1, 'c']),
    );
    expect(keys(three)).toEqual([3]);
  });
});

describe('R3X: a book never shows one picture twice', () => {
  it('gives a place to the first Town Book page found there', () => {
    const pages = [
      { id: 9, place: 'p1', day: 12 },
      { id: 4, place: 'p2', day: 20 },
      { id: 7, place: 'p1', day: 12 },
      { id: 3, place: 'p1', day: 15 },
    ];
    // p1: day 12 twice, the lower id wins; p2 has one page.
    expect([...townBookPictured(pages)].sort((a, b) => a - b)).toEqual([4, 7]);
  });

  it('leaves out a repeated URL, a repeated Chronicle aim and a page whose place is pictured', () => {
    const pic = (url: string) => ({ url });
    const out = oncePerBook([
      { key: 'c:2', picture: pic('a'), entry: entry(2, 3, [10, 10, 12]) },
      { key: 'c:1', picture: pic('b'), entry: entry(1, 3, [10.5, 10, 12]) },
      { key: 'c:0', picture: pic('c'), entry: entry(0, 1, [40, 40, 12]) },
      { key: 'p:x', picture: pic('c') },
      { key: 't:5', picture: pic('d'), pictured: true },
      { key: 't:6', picture: pic('e'), pictured: false },
      { key: 't:8', picture: null, pictured: true },
    ]);
    expect([...out].map(([k, v]) => [k, v?.url ?? null])).toEqual([
      ['c:2', 'a'],
      ['c:1', null],
      ['c:0', 'c'],
      ['p:x', null],
      ['t:5', 'd'],
      ['t:6', null],
      ['t:8', null],
    ]);
  });
});
