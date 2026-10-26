import { useEffect, useRef, useState } from 'preact/hooks';
import { removalRequest } from '../input/removal';

/** Asks before removing the partner's handmade work, with an optional reason sent to them. */
export function RemovalConfirm() {
  const req = removalRequest.value;
  const [reason, setReason] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setReason('');
    input.current?.focus();
  }, [req]);
  if (!req) return null;
  const submit = (e: Event) => {
    e.preventDefault();
    req.resolve(reason.trim());
  };
  return (
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <form class="panel modal" onSubmit={submit} data-testid="removal-confirm">
        <h3>{req.title}</h3>
        <p>{req.body}</p>
        <input
          ref={input}
          value={reason}
          maxLength={120}
          placeholder={req.placeholder}
          data-testid="removal-reason"
          onInput={(e) => setReason((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') req.resolve(null);
          }}
        />
        <div class="actions">
          <button type="button" onClick={() => req.resolve(null)}>
            {req.cancel}
          </button>
          <button type="submit" class="danger" data-testid="removal-ok">
            {req.ok}
          </button>
        </div>
      </form>
    </div>
  );
}
