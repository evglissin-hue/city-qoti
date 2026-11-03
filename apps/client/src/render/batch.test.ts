import { BoxGeometry, Matrix4, MeshBasicMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { KeyedBatch } from './batch';

describe('KeyedBatch.set (V1X)', () => {
  it('says whether anything on screen changed, so a static layer keeps the still frame', () => {
    const batch = new KeyedBatch(new Scene(), new MeshBasicMaterial(), 4, 1000);
    const make = () => new BoxGeometry();
    const at = new Matrix4().makeTranslation(1, 0, 2);
    expect(batch.set(1, 'a', make, at)).toBe(true);
    expect(batch.set(1, 'a', make, at.clone())).toBe(false);
    expect(batch.set(1, 'a', make, new Matrix4().makeTranslation(1, 1, 2))).toBe(true);
    expect(batch.set(1, 'b', make, new Matrix4().makeTranslation(1, 1, 2))).toBe(true);
    batch.dispose();
  });
});
