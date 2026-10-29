// Pure placement validators over any MapReader. Commands call them in validate; the client
// calls them on its Mirror for ghost previews, so previews always match the sim.
export { canPlaceBuilding } from './building';
export { canPlaceDecor, canPlaceDecorRun, decorRunSegments, type DecorSegment } from './decor';
export { entranceTiles, facing, footprintSize, footprintTiles, rotateLocal } from './footprint';
export { circleHitsTile, decorRadius, decorTooClose, isInt, isTile, MAX_DECOR_RADIUS } from './geometry';
export { canPaintRoad } from './road';
export { canPlantTree } from './tree';
export { doorFront, reachesTile, townReach, townSources, type ReachBuilding } from './reach';
