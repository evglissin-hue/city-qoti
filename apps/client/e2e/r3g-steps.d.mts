import type { Page } from '@playwright/test';

export function openStorybook(
  page: Page,
  base: string,
  file: string,
  before?: () => Promise<void>,
): Promise<void>;
export function layInPictures(page: Page, n: number, hour?: number): Promise<number>;
export function layInTownBook(page: Page): Promise<void>;
