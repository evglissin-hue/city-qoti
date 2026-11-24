// The `?debug` flag, apart from debug.ts so the title can read it without loading the renderer's
// showcases (debug.ts imports them; P3D keeps Three.js out of the title's entry chunk).
export const DEBUG = new URLSearchParams(location.search).has('debug');
