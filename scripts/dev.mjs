// Runs the local relay (tools/dev-server) and the client (Vite) together for `npm run dev`.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// QOTI_RELAY_PORT moves the relay (which reads PORT) as it moves the client's proxy, so parallel
// checkouts on their own ports (v2-wave-notes.md, Ports) do not share a relay.
const relayEnv = process.env.QOTI_RELAY_PORT
  ? { ...process.env, PORT: process.env.QOTI_RELAY_PORT }
  : process.env;
const children = [
  spawn(npm, ['run', 'dev', '-w', '@qoti/dev-server'], { stdio: 'inherit', env: relayEnv }),
  spawn(npm, ['run', 'dev', '-w', '@qoti/client'], { stdio: 'inherit' }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
