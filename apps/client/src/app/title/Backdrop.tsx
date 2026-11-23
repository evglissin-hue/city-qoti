import type { Framing, TitleLight } from './shared';

// P3D: a stand-in. The living backdrop replaces this file at merge.
export function TitleBackdrop(_props: { light: TitleLight; framing: Framing }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, #a9d3e8 0%, #cfe6e6 45%, #b9d39f 72%, #8eae78 100%)',
      }}
    />
  );
}
