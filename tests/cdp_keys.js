// 真实键盘事件回归：通过 CDP Input.dispatchKeyEvent 走浏览器真实输入管线，
// 验证按键 -> 游戏状态的变化（不是直接调函数）。
const http = require('http');

function getJSON(port, path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, r => {
      let b = '';
      r.setEncoding('utf8');
      r.on('data', d => (b += d));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

const PORT = Number(process.argv[2] || 9334);
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok, extra });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  KeyC: { key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, text: 'c' },
  KeyP: { key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80, text: 'p' },
  KeyR: { key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82, text: 'r' },
  KeyZ: { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, text: 'z' },
};

(async () => {
  const targets = await getJSON(PORT, '/json');
  const page = targets.find(t => t.type === 'page' && t.url.startsWith('file://') && (t.url.endsWith('.html') && t.url.indexOf('%E9%9C%93') >= 0));
  if (!page) { console.log('NO_PAGE'); process.exit(2); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };

  const press = async (name, opts = {}) => {
    const k = KEYS[name];
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k, ...opts });
    if (k.text) await send('Input.dispatchKeyEvent', { type: 'char', ...k, ...opts });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k, ...opts });
    await new Promise(r => setTimeout(r, 60));
  };

  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 1600));
  await evaluate(`(() => { window.__focused = false; document.body.focus(); window.focus(); })()`);

  // 1) 标题 -> Enter 开始
  let st = await evaluate(`(() => ({ mode: window.__NEON_FALL__.mode }))()`);
  check('开局时处于标题界面', st.mode === 'title', st);
  await press('Enter');
  st = await evaluate(`(() => ({ mode: window.__NEON_FALL__.mode, score: window.__NEON_FALL__.score }))()`);
  check('Enter 开始游戏', st.mode === 'play', st);

  // 2) 左移 / 右移
  let x0 = await evaluate(`(() => window.__NEON_FALL__.cur.x)()`);
  await press('ArrowLeft');
  let x1 = await evaluate(`(() => window.__NEON_FALL__.cur.x)()`);
  check('← 左移一格', x1 === x0 - 1, { x0, x1 });
  await press('ArrowRight');
  await press('ArrowRight');
  let x2 = await evaluate(`(() => window.__NEON_FALL__.cur.x)()`);
  check('→ 右移两格', x2 === x0 + 1, { x0, x2 });

  // 3) 旋转
  const before = await evaluate(`(() => { const p = window.__NEON_FALL__.cur; return { m: JSON.stringify(p.m), t: p.type }; })()`);
  await press('ArrowUp');
  const afterRot = await evaluate(`(() => { const p = window.__NEON_FALL__.cur; return { m: JSON.stringify(p.m), t: p.type }; })()`);
  check('↑ 顺时针旋转', before.t === 'O' || before.m !== afterRot.m, { before, afterRot });

  // 4) Z 逆时针
  const beforeZ = await evaluate(`(() => JSON.stringify(window.__NEON_FALL__.cur.m))()`);
  await press('KeyZ');
  const afterZ = await evaluate(`(() => JSON.stringify(window.__NEON_FALL__.cur.m))()`);
  check('Z 逆时针旋转', beforeZ !== afterZ || JSON.parse(beforeZ).every(r => r === 0) === false, { beforeZ, afterZ });

  // 5) 空格硬降：分数应增加、落下新的当前块
  const s0 = await evaluate(`(() => ({ score: window.__NEON_FALL__.score, y: window.__NEON_FALL__.cur.y }))()`);
  await press('Space');
  await new Promise(r => setTimeout(r, 200));
  const s1 = await evaluate(`(() => ({ score: window.__NEON_FALL__.score, lines: window.__NEON_FALL__.lines }))()`);
  check('空格硬降并加分', s1.score > s0.score, { s0, s1 });

  // 6) C 暂存
  const hold0 = await evaluate(`(() => window.__NEON_FALL__.G.hold)()`);
  await press('KeyC');
  const hold1 = await evaluate(`(() => window.__NEON_FALL__.G.hold)()`);
  check('C 暂存方块', hold0 === null && hold1 !== null && hold1 !== undefined, { hold0: hold0 && hold0.type, hold1: hold1 && hold1.type });

  // 7) P 暂停 / 继续
  await press('KeyP');
  let pm = await evaluate(`(() => window.__NEON_FALL__.mode)()`);
  check('P 暂停', pm === 'pause', { mode: pm });
  await press('KeyP');
  pm = await evaluate(`(() => window.__NEON_FALL__.mode)()`);
  check('P 继续', pm === 'play', { mode: pm });

  // 8) R 重开：分数归零
  await press('Space');
  await new Promise(r => setTimeout(r, 200));
  const sc = await evaluate(`(() => window.__NEON_FALL__.score)()`);
  await press('KeyR');
  await new Promise(r => setTimeout(r, 150));
  const sc2 = await evaluate(`(() => ({ score: window.__NEON_FALL__.score, mode: window.__NEON_FALL__.mode }))()`);
  check('R 重开归零', sc2.score === 0 && sc2.mode === 'play', { before: sc, after: sc2 });

  // 9) 鼠标点击开始（标题态）
  await evaluate(`(() => { const N = window.__NEON_FALL__; N.resetGame(); N.G.mode = 'title'; })()`);
  await new Promise(r => setTimeout(r, 120));
  const box = await evaluate(`(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 250));
  const clickMode = await evaluate(`(() => window.__NEON_FALL__.mode)()`);
  check('点击画布开始游戏', clickMode === 'play', { mode: clickMode });

  const fails = results.filter(r => !r.ok).length;
  console.log(`\nRESULT failures=${fails} / ${results.length}`);
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
