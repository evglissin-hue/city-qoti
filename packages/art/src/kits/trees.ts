// Forest trees (the map's tree layer): instanced cone or blob canopies on a trunk, about one and a
// half world units tall when mature. The renderer scales them by growth stage.
import { ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import type { Kit } from './types';

export const birch: Kit = {
  id: 'birch',
  kind: 'tree',
  build: () =>
    new ShapeBuilder()
      .cylinder(0, 0, 0.05, 0.04, 0, 0.8, palette.birchBark, 6)
      .blob(0, 1.05, 0, 0.26, 0.42, 0.26, palette.leafLight)
      .build(),
};

export const oak: Kit = {
  id: 'oak',
  kind: 'tree',
  build: () =>
    new ShapeBuilder()
      .cylinder(0, 0, 0.09, 0.07, 0, 0.6, palette.bark, 6)
      .blob(0, 0.95, 0, 0.45, 0.4, 0.45, palette.leaf)
      .build(),
};

export const pine: Kit = {
  id: 'pine',
  kind: 'tree',
  build: () =>
    new ShapeBuilder()
      .cylinder(0, 0, 0.07, 0.06, 0, 0.35, palette.bark, 6)
      .cylinder(0, 0, 0.42, 0, 0.3, 1.1, palette.pine, 7)
      .cylinder(0, 0, 0.32, 0, 0.75, 1.6, palette.pine, 7)
      .build(),
};
