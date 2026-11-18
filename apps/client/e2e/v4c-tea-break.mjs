// V4C: a tea break's frames and numbers (a script, not a spec). Needs the client dev server
// (`npm run dev`; QOTI_CLIENT_PORT, 5263 for V4C):
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4c-tea-break.mjs shots [day|evening ...]
//   QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4c-tea-break.mjs perf
// `shots` starts a tea break in the grown village (`QOTI_FIXTURE`, grown; hamlet for a fresh one) by
// day (11:00, the busiest place's circle) or in the evening (the sim run on to 18:00, a resident on
// their round), then shoots the page every `QOTI_EVERY` ms (1500) `QOTI_COUNT` times (6) as
// docs/build/screenshots/v4c-<fixture>-<scene>-<n>.png, and checks the first input puts the view back
// exactly. `perf` runs, per preset, a tea break for `QOTI_SECONDS` (8) and then a scripted turn of
// the camera for as long (a moving path, V3's kind), and prints the modes, draws, triangles and
// frame times of each side by side: a tea break is a moving camera, so its frames must be moving
// frames inside the moving budget. In software (SwiftShader) draws and triangles are real and
// milliseconds are ratios at best.
import { chromium } from '@playwright/test';

const clientPort = Number(process.env.QOTI_CLIENT_PORT ?? 5263);
const base = `http://localhost:${clientPort}`;
const [cmd = 'shots', ...rest] = process.argv.slice(2);
const fixture = process.env.QOTI_FIXTURE ?? 'grown';
const out = process.env.QOTI_OUT ?? 'docs/build/screenshots';
const [vw, vh] = (process.env.QOTI_SIZE ?? '1280x800').split('x').map(Number);
const every = Number(process.env.QOTI_EVERY ?? 1500);
const count = Number(process.env.QOTI_COUNT ?? 6);
const seconds = Number(process.env.QOTI_SECONDS ?? 8);

const launch = () =>
  chromium.launch({
    ...(process.env.QOTI_CHROMIUM ? { executablePath: process.env.QOTI_CHROMIUM } : {}),
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });

async function open(browser, quality, extra = '') {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(
    `${base}/?debug&fixture=${fixture}&clean&teabreak&quality=${quality}&season=summer&day=3&weather=clear${extra}`,
  );
  await page.waitForFunction(() => window.__qoti?.status() === 'live', null, { timeout: 240000 });
  await page.waitForFunction(() => !!window.__qotiTeaBreak, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await closeCards(page);
  return page;
}

/** Puts away whatever card a fixture opens with (the grown village's festival card): a card blocks a tea break. */
const closeCards = (page) =>
  page.evaluate(() => {
    const t = window.__qotiTeaBreak;
    const empty = { settingsOpen: false, chapter: false, inviteOpen: false, helpOpen: false, asking: false };
    for (const name of t.guards().open) window.__qoti.setUi(name, name in empty ? empty[name] : null);
    return t.guards().open;
  });

const view = (page) => page.evaluate(() => window.__qoti.renderer().rig.saveView());
const camPos = (page) =>
  page.evaluate(() => {
    const p = window.__qoti.renderer().camera.position;
    return [p.x, p.y, p.z];
  });

/** Runs the sim on until the clock reads `hour` or later. */
async function runTo(page, hour) {
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 3 }));
  await page.waitForFunction(
    (h) => {
      const c = window.__qoti.clock();
      return c && c.hour + c.minute / 60 >= h && c.hour < 21;
    },
    hour,
    { timeout: 600000, polling: 1000 },
  );
  await page.evaluate(() => window.__qoti.submit({ t: 'time.setSpeed', speed: 1 }));
}

async function shots(scenes) {
  const browser = await launch();
  for (const scene of scenes) {
    const page = await open(browser, process.env.QOTI_QUALITY ?? 'medium');
    if (scene === 'evening') await runTo(page, 18);
    else await page.evaluate(() => window.__qoti.setHour(11));
    const before = await view(page);
    const pos = await camPos(page);
    await closeCards(page);
    await page.evaluate(() => window.__qotiTeaBreak.skip(90000));
    const state = await page.evaluate(() => window.__qotiTeaBreak.state());
    console.log(
      `${fixture} ${scene}: clock`,
      await page.evaluate(() => window.__qoti.clock()),
      'plan',
      state?.plan,
    );
    if (!state) {
      await page.close();
      continue;
    }
    for (let i = 0; i < count; i++) {
      await page.waitForTimeout(every);
      const st = await page.evaluate(() => {
        const s = window.__qoti.stats();
        return { mode: s.mode, draws: s.drawCalls, ms: Math.round(s.frameMs) };
      });
      const v = await view(page);
      const file = `${out}/v4c-${fixture}-${scene}-${i}.png`;
      await page.screenshot({ path: file, timeout: 120000 });
      console.log(
        `  ${file}`,
        st,
        `yaw ${v.yaw.toFixed(3)} dist ${v.distance.toFixed(1)} pitch ${((v.pitch * 180) / Math.PI).toFixed(1)}`,
      );
    }
    await page.keyboard.press('Shift');
    await page.waitForTimeout(300);
    const after = await view(page);
    const posAfter = await camPos(page);
    const same =
      JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(pos) === JSON.stringify(posAfter);
    console.log(`  input restores the view exactly: ${same}`, same ? '' : { before, after, pos, posAfter });
    await page.screenshot({ path: `${out}/v4c-${fixture}-${scene}-back.png`, timeout: 120000 });
    await page.close();
  }
  await browser.close();
}

/** Samples the renderer's stats each frame for `ms`. */
const sample = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const q = window.__qoti;
        const t0 = performance.now();
        const drawn0 = q.stats().drawn;
        const rows = [];
        const step = () => {
          const s = q.stats();
          rows.push({ mode: s.mode, draws: s.drawCalls, tris: s.triangles, ms: s.frameMs, gpu: s.gpuMs });
          if (performance.now() - t0 < ms) requestAnimationFrame(step);
          else resolve({ rows, drawn: q.stats().drawn - drawn0 });
        };
        requestAnimationFrame(step);
      }),
    ms,
  );

function summary(label, { rows, drawn }) {
  const modes = {};
  for (const r of rows) modes[r.mode] = (modes[r.mode] ?? 0) + 1;
  const sorted = (k) => rows.map((r) => r[k]).sort((a, b) => a - b);
  const p = (k, q) => {
    const s = sorted(k);
    return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
  };
  return {
    label,
    frames: drawn,
    modes: Object.entries(modes)
      .map(([k, v]) => `${k} ${v}`)
      .join(', '),
    draws: `${p('draws', 0.5)} / ${p('draws', 0.95)}`,
    tris: `${p('tris', 0.5)} / ${p('tris', 0.95)}`,
    frameMs: `${p('ms', 0.5).toFixed(1)} / ${p('ms', 0.95).toFixed(1)}`,
  };
}

async function perf() {
  const browser = await launch();
  const lines = [
    '| Preset | Camera | Frames | Modes | Draws P50 / P95 | Triangles P50 / P95 | Frame ms P50 / P95 |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const quality of ['low', 'medium', 'high', 'ultra']) {
    const page = await open(browser, quality);
    await page.evaluate(() => window.__qoti.setHour(11));
    await closeCards(page);
    await page.evaluate(() => window.__qotiTeaBreak.skip(90000));
    const plan = await page.evaluate(() => window.__qotiTeaBreak.state()?.plan);
    await page.waitForTimeout(1500);
    const tea = summary('tea break', await sample(page, seconds * 1000));
    await page.keyboard.press('Shift');
    // The moving path: a slow turn at the same distance, as the tea break circles.
    await page.evaluate(() => {
      const r = window.__qoti.renderer();
      window.__turn = setInterval(() => r.rig.rotateBy(0.004, 0), 16);
    });
    await page.waitForTimeout(500);
    const turn = summary('turning by hand', await sample(page, seconds * 1000));
    await page.evaluate(() => clearInterval(window.__turn));
    console.log(quality, plan, tea, turn);
    for (const s of [tea, turn])
      lines.push(
        `| ${quality} | ${s.label} | ${s.frames} | ${s.modes} | ${s.draws} | ${s.tris} | ${s.frameMs} |`,
      );
    await page.close();
  }
  await browser.close();
  console.log(lines.join('\n'));
}

if (cmd === 'perf') await perf();
else await shots(rest.length ? rest : ['day', 'evening']);
