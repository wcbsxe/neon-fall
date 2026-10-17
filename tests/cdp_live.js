// 针对线上 GitHub Pages 的回归：真实键盘 + 完整对局。
// 用法: node cdp_live.js <port>
const http = require('http');

function getJSON(port, path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', d => (b += d));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

const PORT = Number(process.argv[2] || 9340);

(async () => {
  const targets = await getJSON(PORT, '/json');
  const page = targets.find(t => t.type === 'page' && t.url.indexOf('github.io') >= 0);
  if (!page) { console.log('NO_PAGE'); process.exit(2); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable'); await send('Page.enable');

  const errors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push((m.params.args[0] || {}).value || 'console.error');
  });

  const ev2 = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  const fails = [];
  const check = (name, cond, extra) => {
    console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : ''));
    if (!cond) fails.push(name);
  };

  // 键盘事件
  const key = async (code, keyName, keyCode, text) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, code, key: keyName });
    if (text) {
      await send('Input.dispatchKeyEvent', { type: 'char', text, key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    }
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, code, key: keyName });
    await new Promise(r => setTimeout(r, 90));
  };
  const keyCodeOf = (k) => ({ Enter: 13, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, KeyZ: 90, KeyC: 67, KeyP: 80, KeyR: 82 }[k] || 0);

  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2500));

  // 1. 钩子
  const hook = await ev2('typeof window.__NEON_FALL__');
  check('页面加载 + 调试钩子存在', hook === 'object', { hook });

  // 2. 标题态
  check('初始为标题界面', (await ev2('window.__NEON_FALL__.mode')) === 'title');

  // 3. Enter 开局
  await key('Enter', 'Enter', 13, String.fromCharCode(13));
  const mode1 = await ev2('window.__NEON_FALL__.mode');
  check('Enter 开局', mode1 === 'play', { mode: mode1 });

  // 4. 左右移动
  await key('ArrowRight', 'ArrowRight', 39);
  await key('ArrowRight', 'ArrowRight', 39);
  await key('ArrowRight', 'ArrowRight', 39);
  const x0 = await ev2('window.__NEON_FALL__.cur.x');
  await key('ArrowLeft', 'ArrowLeft', 37);
  await key('ArrowLeft', 'ArrowLeft', 37);
  const x1 = await ev2('window.__NEON_FALL__.cur.x');
  check('← 左移', x1 < x0, { from: x0, to: x1 });

  // 5. 旋转
  const r0 = await ev2('JSON.stringify(window.__NEON_FALL__.cur.m)');
  await key('ArrowUp', 'ArrowUp', 38);
  const r1 = await ev2('JSON.stringify(window.__NEON_FALL__.cur.m)');
  check('↑ 顺时针旋转', r0 !== r1);

  // 6. 硬降加分
  const s0 = await ev2('window.__NEON_FALL__.score');
  await key('Space', ' ', 32, ' ');
  const s1 = await ev2('window.__NEON_FALL__.score');
  check('空格硬降加分', s1 > s0, { from: s0, to: s1 });

  // 7. Hold
  const hold0 = await ev2('JSON.stringify(window.__NEON_FALL__.G.hold)');
  await key('KeyC', 'c', 67, 'c');
  const hold1 = await ev2('JSON.stringify(window.__NEON_FALL__.G.hold)');
  check('C 暂存', hold0 !== hold1, { from: hold0, to: hold1 });

  // 8. 暂停
  await key('KeyP', 'p', 80, 'p');
  const mode2 = await ev2('window.__NEON_FALL__.mode');
  check('P 暂停', mode2 === 'pause', { mode: mode2 });
  await key('KeyP', 'p', 80, 'p');
  check('P 继续', (await ev2('window.__NEON_FALL__.mode')) === 'play');

  // 9. 最高分持久化（localStorage 在 https 下必然可用）
  const lsOk = await ev2('(() => { try { localStorage.setItem("__t","1"); const v = localStorage.getItem("__t")==="1"; localStorage.removeItem("__t"); return v; } catch(e) { return false; } })()');
  check('localStorage 可用（最高分能存）', lsOk === true);

  // 10. AudioContext
  check('WebAudio 可用', (await ev2('typeof (window.AudioContext || window.webkitAudioContext)')) === 'function');

  // 11. 完整对局：硬降 60 次，看计分/消行链路
  await key('KeyR', 'r', 82, 'r');
  await new Promise(r => setTimeout(r, 300));
  for (let i = 0; i < 60; i++) {
    await ev2('(() => { const N = window.__NEON_FALL__; if (N.mode !== "play") return 0; N.hardDrop(); if (N.G.clearing) { N.G.clearing.t = 1; N.finishClear(); } return 1; })()');
    await new Promise(r => setTimeout(r, 12));
  }
  const fin = await ev2('(() => { const N = window.__NEON_FALL__; return { mode: N.mode, score: N.score, lines: N.lines, level: N.G.level }; })()');
  check('完整对局计分链路', fin.score > 0, fin);

  // 12. 无 JS 错误
  check('无 JS 运行时错误', errors.length === 0, { errors: errors.slice(0, 3) });

  console.log('\nRESULT failures=' + fails.length + ' / 12');
  if (fails.length) console.log('FAILED: ' + fails.join(', '));
  ws.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
