// 更强的 bot：在真实浏览器里跑完整对局，验证消行 / 升级 / 连击 / 计分。
// 评估函数：聚合高度、空洞、最大高度、消行奖励（经典 Dellacherie 简化版）。
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

const PORT = Number(process.argv[2] || 9334);
const MAX_PIECES = Number(process.argv[3] || 400);

(async () => {
  const targets = await getJSON(PORT, '/json');
  const page = targets.find(t => t.type === 'page' && t.url.startsWith('file://') && (t.url.endsWith('.html') && t.url.indexOf('%E9%9C%93') >= 0));
  if (!page) { console.log('NO_PAGE'); process.exit(2); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable'); await send('Page.enable');

  const ev = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 1500));

  // 在页面里装一个 bot：每次决策返回 {rot, dx}，然后由外部施加。
  await ev(`
    (() => {
      const N = window.__NEON_FALL__;
      const { G, pieceCells, collidingWith } = N;
      const COLS = 10, ROWS = 20, BUF = 2;

      function snapshotBoard() { return G.board.map(r => r.slice()); }
      function heightOf(board, c) {
        for (let r = BUF; r < BUF + ROWS; r++) if (board[r][c]) return ROWS - (r - BUF);
        return 0;
      }
      // 在给定棋盘上模拟落位，返回评估分
      function evaluate(board, rowsCleared) {
        const hs = [];
        for (let c = 0; c < COLS; c++) hs.push(heightOf(board, c));
        const agg = hs.reduce((a, b) => a + b, 0);
        const maxH = Math.max(...hs);
        let holes = 0, bump = 0;
        for (let c = 0; c < COLS; c++) {
          let seen = false;
          for (let r = BUF; r < BUF + ROWS; r++) {
            if (board[r][c]) seen = true;
            else if (seen) holes++;
          }
          if (c > 0) bump += Math.abs(hs[c] - hs[c - 1]);
        }
        const clearBonus = [0, -1.2, -3.0, -6.0, -12.0][rowsCleared] || 0;
        return -0.51 * agg + clearBonus * 10 - 0.36 * holes * 10 - 0.18 * maxH - 0.18 * bump;
      }
      function apply(board, shape, px, py) {
        const b = board.map(r => r.slice());
        for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape.length; c++) {
          if (!shape[r][c]) continue;
          const x = px + c, y = py + r;
          if (x < 0 || x >= COLS || y >= BUF + ROWS) return null;
          if (y >= BUF && b[y][x]) return null;
          if (y >= 0) b[y][x] = 1;
        }
        // 消行
        let cleared = 0;
        for (let r = BUF + ROWS - 1; r >= BUF; r--) {
          if (b[r].every(v => v)) { b.splice(r, 1); b.unshift(new Array(COLS).fill(null)); cleared++; r++; }
        }
        return { board: b, cleared };
      }

      window.__bot = {
        decide() {
          const p = G.cur;
          if (!p) return null;
          let best = null;
          for (let rot = 0; rot < 4; rot++) {
            const m = p.m;
            for (let dx = -6; dx <= 6; dx++) {
              const px = p.x + dx;
              let py = p.y;
              // 落到最低
              while (!collidingWith(m, px, py + 1)) py++;
              const res = apply(snapshotBoard(), m, px, py);
              if (!res) continue;
              const sc = evaluate(res.board, res.cleared);
              if (!best || sc > best.sc) best = { sc, rot, dx, px, cleared: res.cleared };
            }
            // 顺时针转一次看下一朝向（用真实旋转函数会改状态，改用矩阵旋转）
            const nm = m[0].map((_, i) => m.map(row => row[i]).reverse());
            p.m = nm;
          }
          p.m = p.__orig || p.m; // 复原（下一帧由外部重新取）
          return best;
        },
      };
      window.__botReady = true;
    })()
  `);

  // 由于上面的旋转会破坏状态，改成：外部逐步做「真实旋转 + 真实左右移动」
  // 用真实 API 走一遍，避免直接改矩阵。
  await ev(`(() => { const N = window.__NEON_FALL__; N.resetGame(); N.startGame(); })()`);
  await new Promise(r => setTimeout(r, 200));

  const state = async () => await ev(`(() => {
    const N = window.__NEON_FALL__;
    return { mode: N.mode, score: N.score, lines: N.lines, level: (N.G && N.G.level), drops: N.G && N.G.pieces };
  })()`);

  let pieces = 0, maxScore = 0, maxLines = 0, maxLevel = 1, clears = [];
  let prevLines = 0;

  while (pieces < MAX_PIECES) {
    const st = await state();
    if (st.mode !== 'play') break;

    // 让 bot 在页面里算好目标，再通过真实按键操作
    const target = await ev(`(() => {
      const N = window.__NEON_FALL__;
      const { G, collidingWith } = N;
      const COLS = 10, ROWS = 20, BUF = 2;
      const p = G.cur;
      if (!p) return null;
      const prot = (m1) => m1[0].map((_, i) => m1.map(row => row[i]).reverse());
      function heightOf(b, c) { for (let r = BUF; r < BUF + ROWS; r++) if (b[r][c]) return ROWS - (r - BUF); return 0; }
      function evalB(b, cl) {
        const hs = []; for (let c = 0; c < COLS; c++) hs.push(heightOf(b, c));
        const agg = hs.reduce((a, x) => a + x, 0), maxH = Math.max(...hs);
        let holes = 0, bump = 0;
        for (let c = 0; c < COLS; c++) { let seen = false;
          for (let r = BUF; r < BUF + ROWS; r++) { if (b[r][c]) seen = true; else if (seen) holes++; }
          if (c > 0) bump += Math.abs(hs[c] - hs[c - 1]); }
        const cb = [0, 1.2, 3.0, 6.0, 12.0][cl] || 0;
        return -0.51*agg + cb*10 - 3.6*holes - 0.18*maxH - 0.18*bump;
      }
      function simulate(b0, shape, px, py) {
        const b = b0.map(r => r.slice());
        for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape.length; c++) {
          if (!shape[r][c]) continue;
          const x = px + c, y = py + r;
          if (x < 0 || x >= COLS || y >= BUF + ROWS) return null;
          if (y >= BUF && b[y][x]) return null;
          if (y >= 0) b[y][x] = 1;
        }
        let cl = 0;
        for (let r = BUF + ROWS - 1; r >= BUF; r--) {
          if (b[r].every(v => v)) { b.splice(r, 1); b.unshift(new Array(COLS).fill(null)); cl++; r++; } }
        return { b, cl };
      }
      let best = null, m = p.m.map(r => r.slice());
      for (let rot = 0; rot < 4; rot++) {
        for (let dx = -6; dx <= 6; dx++) {
          const px = p.x + dx;
          let py = p.y;
          let guard = 0;
          while (!collidingWith(m, px, py + 1) && guard++ < 40) py++;
          const res = simulate(G.board, m, px, py);
          if (!res) continue;
          const sc = evalB(res.b, res.cl);
          if (!best || sc > best.sc) best = { sc, rot, px, py, cl: res.cl };
        }
        m = prot(m);
      }
      return best ? { rot: best.rot, px: best.px, cl: best.cl } : null;
    })()`);

    if (!target) break;

    // 施加真实旋转
    for (let i = 0; i < target.rot; i++) {
      await ev(`(() => window.__NEON_FALL__.tryRotate(1))()`);
    }
    // 施加真实左右移动
    const curX = await ev(`(() => window.__NEON_FALL__.cur.x)()`);
    const delta = target.px - curX;
    const dir = delta > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(delta); i++) {
      const ok = await ev(`(() => window.__NEON_FALL__.move(${dir}))()`);
      if (!ok) break;
    }
    // 硬降
    await ev(`(() => window.__NEON_FALL__.hardDrop())()`);
    await new Promise(r => setTimeout(r, 30));
    // 等消行动画结算
    await ev(`(() => { const G = window.__NEON_FALL__.G; if (G.clearing) { G.clearing.t = 1; window.__NEON_FALL__.finishClear(); } })()`);
    await new Promise(r => setTimeout(r, 20));

    pieces++;
    const s2 = await state();
    if (s2.lines > prevLines) { clears.push(s2.lines - prevLines); prevLines = s2.lines; }
    maxScore = Math.max(maxScore, s2.score || 0);
    maxLines = Math.max(maxLines, s2.lines || 0);
    maxLevel = Math.max(maxLevel, s2.level || 1);
    if (s2.mode !== 'play') break;
  }

  const final = await state();
  console.log('PIECES  ', pieces);
  console.log('SCORE   ', maxScore);
  console.log('LINES   ', maxLines);
  console.log('LEVEL   ', maxLevel);
  console.log('CLEARS  ', JSON.stringify(clears));
  console.log('MODE    ', final.mode);

  // 顺手截一张真实对局图
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(process.argv[4] || 'bot_play.png', Buffer.from(shot.data, 'base64'));

  ws.close();
  process.exit(0);
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
