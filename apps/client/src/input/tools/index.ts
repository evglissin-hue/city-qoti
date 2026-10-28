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
import { inspectTool } from './inspect';
import { noteTool } from './note';
import { planTool } from './plan';
import { roadTool } from './road';
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
  fieldTool,
  inspectTool,
  roadTool('lane'),
  noteTool,
  roadTool('path'),
  planTool,
  roadTool('street'),
  treeTool,
  zoneTool,
];
