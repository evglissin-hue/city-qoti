import { useEffect, useRef, useState } from 'preact/hooks';
import { inviteLink } from '../app/invite';
import type { Session } from '../app/session';

/** Confirm and prompt dialogs requested by tools. */
export function Dialogs({ session }: { session: Session }) {
  const dialog = session.ui.dialog.value;
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText('');
    input.current?.focus();
  }, [dialog]);
  if (!dialog) return null;
  const close = () => (session.ui.dialog.value = null);

  if (dialog.kind === 'confirm') {
    return (
      <div class="modal-backdrop">
        <div class="panel modal" role="dialog" data-testid="confirm">
          <p>{dialog.text}</p>
          <div class="actions">
            <button type="button" onClick={() => (close(), dialog.resolve(false))}>
              {dialog.cancel}
            </button>
            <button
              type="button"
              class="danger"
              data-testid="confirm-ok"
              onClick={() => (close(), dialog.resolve(true))}
            >
              {dialog.ok}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submit = (e: Event) => {
    e.preventDefault();
    close();
    dialog.resolve(text.trim() ? text.trim() : null);
  };
  return (
    <div class="modal-backdrop">
      <form class="panel modal" onSubmit={submit} data-testid="prompt">
        <h3>{dialog.title}</h3>
        <input
          ref={input}
          value={text}
          maxLength={dialog.max}
          placeholder={dialog.placeholder}
          data-testid="prompt-input"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            close();
            dialog.resolve(null);
          }}
        />
        <div class="actions">
          <button type="button" onClick={() => (close(), dialog.resolve(null))}>
            Never mind
          </button>
          <button type="submit" class="primary" data-testid="prompt-ok">
            Pin it
          </button>
        </div>
      </form>
    </div>
  );
}

/** The invite link for seat 2 of an online valley. */
export function InviteDialog({ session }: { session: Session }) {
  const [copied, setCopied] = useState(false);
  if (!session.ui.inviteOpen.value) return null;
  const fragment = session.target.invite;
  const link = fragment ? inviteLink(fragment) : null;
  const close = () => (session.ui.inviteOpen.value = false);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="panel modal invite" role="dialog" data-testid="invite">
        <h3>Invite your partner</h3>
        {link ? (
          <>
            <p>
              Send them this link. It opens the second seat of this valley, so keep it between the two of you.
            </p>
            <input
              readOnly
              value={link}
              data-testid="invite-link"
              onFocus={(e) => (e.target as HTMLInputElement).select()}
            />
            <div class="actions">
              <button type="button" onClick={close}>
                Done
              </button>
              <button
                type="button"
                class="primary"
                onClick={() => {
                  void navigator.clipboard?.writeText(link).then(() => setCopied(true));
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              The invite link lives on the device that created this valley. Ask your partner to send it again.
            </p>
            <div class="actions">
              <button type="button" onClick={close}>
                Fine
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Toasts({ session }: { session: Session }) {
  return (
    <div class="toasts">
      {session.ui.toasts.value.map((t) => (
        <div
          key={t.id}
          class="toast panel"
          style={{ left: `${t.x}px`, top: `${t.y - 54}px` }}
          data-testid="toast"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** ?debug overlay: frame stats, turn, hash and entity counts. */
export function DebugOverlay({ session }: { session: Session }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const s = session.renderer?.stats;
  const m = session.mirror;
  const h = session.debug.lastHash;
  return (
    <pre class="debug-overlay">
      {`fps ${s?.fps ?? 0}  frame ${(s?.frameMs ?? 0).toFixed(1)} ms
draws ${s?.drawCalls ?? 0}  tris ${s?.triangles ?? 0}
turn ${m.lastTurn.value}  tick ${m.tick.value}
hash ${h ? `${h.t} ${h.h}` : '-'}
buildings ${m.buildings.size}  decor ${m.decor.size}  notes ${m.notes.size}
sim ${m.simVersion}`}
    </pre>
  );
}
