import type { CreateValleyRequest, CreateValleyResponse } from '@qoti/protocol';

/** POST /api/valleys: creates an online valley on the relay. */
export async function createOnlineValley(body: CreateValleyRequest): Promise<CreateValleyResponse> {
  const res = await fetch('/api/valleys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`The relay said ${res.status}`);
  return (await res.json()) as CreateValleyResponse;
}
