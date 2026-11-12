/** V2C: whether the resident bubbles show for an overlay kind (`Renderer.setOverlay`): only 'bubbles'. */
export function bubblesFor(kind: string | null): boolean {
  return kind === 'bubbles';
}

/** The kind the overlays layer gets: 'bubbles' is the agents layer's, so it draws no overlay. */
export function overlayKindFor(kind: string | null): string | null {
  return kind === 'bubbles' ? null : kind;
}
