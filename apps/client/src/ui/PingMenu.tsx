import { copy } from './copy';
import { pingMenu, sendPing, type PingKind } from './pingBus';

const KINDS: PingKind[] = ['look', 'help', 'build'];

/** The Alt+click menu: Look here, Help, Build here. */
export function PingMenuView() {
  const m = pingMenu.value;
  if (!m) return null;
  const close = () => (pingMenu.value = null);
  return (
    <div class="ping-menu-backdrop" onPointerDown={close}>
      <div
        class="panel ping-menu"
        role="menu"
        data-testid="ping-menu"
        style={{ left: `${m.sx}px`, top: `${m.sy}px` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="menuitem"
            class={`ping-${k}`}
            data-testid={`ping-${k}`}
            onClick={() => {
              sendPing(m.x, m.z, k);
              close();
            }}
          >
            {copy.pingMenu[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
