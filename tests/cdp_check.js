// 通过 CDP 连到正在运行的 Edge 应用窗口，检查游戏页面是否真的跑起来 + 截一张图
const http = require('http');
const fs = require('fs');

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
const SHOT = process.argv[3] || 'D:/code test/neon-fall-portable/_live.png';

(async () => {
  const targets = await getJSON(PORT, '/json');
  const page = targets.find(t => t.type === 'page' && t.url.startsWith('file://') && (t.url.endsWith('.html') && t.url.indexOf('%E9%9C%93') >= 0));
  if (!page) { console.log('NO_PAGE'); process.exit(2); }
  console.log('page:', page.title, page.url);

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

  const evaluate = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };

  // 页面环境体检
  const info = await evaluate(`(() => {
    const N = window.__NEON_FALL__;
    return {
      hasHook: !!N,
      title: document.title,
      canvas: (() => { const c = document.getElementById('game'); const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height) }; })(),
      dpr: window.devicePixelRatio,
      inner: [innerWidth, innerHeight],
      mode: N ? N.mode : null,
    };
  })()`);
  console.log('INFO', JSON.stringify(info));

  // 开始游戏，模拟 3 秒（手动推进 update，不依赖真实时间）
  const play = await evaluate(`(async () => {
    const N = window.__NEON_FALL__;
    N.startGame();
    let drops = 0, rots = 0, moves = 0;
    for (let i = 0; i < 600; i++) {
      N.update(0.016);
      if (i % 9 === 0) { if (N.move(i % 18 === 0 ? -1 : 1)) moves++; }
      if (i % 23 === 0) { if (N.tryRotate(1)) rots++; }
      if (i % 31 === 0) { N.hardDrop(); drops++; }
      if (N.mode === 'over') break;
    }
    return { mode: N.mode, score: N.score, lines: N.lines, drops, rots, moves,
             cur: N.cur && N.cur.type, boardRows: N.board.length };
  })()`, true);
  console.log('PLAY', JSON.stringify(play));

  // 清掉调试状态，回到标题界面截图
  await evaluate(`(() => { const N = window.__NEON_FALL__; N.resetGame(); N.G.mode = 'title'; })()`);
  await new Promise(r => setTimeout(r, 400));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', SHOT, fs.statSync(SHOT).size);

  // 顺手确认音频上下文与 localStorage 没炸
  const env = await evaluate(`(() => {
    let ls = 'n/a';
    try { localStorage.setItem('__probe', '1'); ls = localStorage.getItem('__probe'); localStorage.removeItem('__probe'); } catch (e) { ls = 'ERR:' + e.name; }
    return { ls, ac: typeof (window.AudioContext || window.webkitAudioContext), errors: (window.__ERRS__ || []).length };
  })()`);
  console.log('ENV', JSON.stringify(env));

  ws.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
