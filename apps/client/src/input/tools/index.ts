// Tool registry: one line per tool, in alphabetical order by id. The toolbar orders tools by
// their `order` field and shows each lens its own and shared tools.
import type { ToolContext } from '../context';
import type { Tool } from '../tool';
import { buildingTool } from './building';
import { customizeTool } from './customize';
import { decorTool } from './decor';
import { eraseTool } from './erase';
import { fenceTool } from './fence';
import { fieldTool } from './field';
import { flowersTool } from './flowers';
import { inspectTool } from './inspect';
import { layoutTool } from './layout';
import { noteTool } from './note';
import { planTool } from './plan';
import { roadTool } from './road';
import { festivalSiteTool, guardTool, pondTool, wallTool } from './seasons';
import { terrainTool } from './terrain';
import { treeTool } from './tree';
import { zoneTool } from './zone';

export type ToolFactory = (ctx: ToolContext) => Tool;

// prettier-ignore
export const toolFactories: readonly ToolFactory[] = [
  buildingTool,
  customizeTool,
  decorTool,
  eraseTool,
  fenceTool,
  festivalSiteTool,
  fieldTool,
  flowersTool,
  guardTool,
  inspectTool,
  roadTool('lane'),
  layoutTool,
  noteTool,
  roadTool('path'),
  planTool,
  pondTool,
  roadTool('street'),
  terrainTool,
  treeTool,
  wallTool,
  zoneTool,
];
