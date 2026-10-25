// Tool registry: one line per tool, in alphabetical order by id. The toolbar orders tools by
// their `order` field and shows each lens its own and shared tools.
import type { ToolContext } from '../context';
import type { Tool } from '../tool';
import { buildingTool } from './building';
import { decorTool } from './decor';
import { eraseTool } from './erase';
import { fenceTool } from './fence';
import { inspectTool } from './inspect';
import { noteTool } from './note';
import { pingTool } from './ping';
import { roadTool } from './road';
import { treeTool } from './tree';

export type ToolFactory = (ctx: ToolContext) => Tool;

// prettier-ignore
export const toolFactories: readonly ToolFactory[] = [
  buildingTool,
  decorTool,
  eraseTool,
  fenceTool,
  inspectTool,
  roadTool('lane'),
  noteTool,
  roadTool('path'),
  pingTool,
  treeTool,
];
