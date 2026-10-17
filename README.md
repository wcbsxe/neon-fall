# 霓虹坠落 · NEON FALL

**一个霓虹发光风格的俄罗斯方块，整个游戏就是一个 HTML 文件。**

零依赖 · 零联网 · 离线可玩 · 双击即开

[![在线试玩](https://img.shields.io/badge/%F0%9F%8E%AE_%E5%9C%A8%E7%BA%BF%E8%AF%95%E7%8E%A9-4d7cff?style=for-the-badge)](https://wcbsxe.github.io/neon-fall/)
[![License](https://img.shields.io/badge/license-MIT-3dffa0.svg)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/dependencies-0-c35bff.svg)]()
[![Single File](https://img.shields.io/badge/size-48_KB-26e8ff.svg)]()

<img src="screenshots/gameplay.png" alt="游戏界面" width="100%">

---

## 这是什么

一个用 Canvas 2D 手写的俄罗斯方块。没有用任何游戏引擎、框架或第三方库，`game.js` 里 1300 行是全部代码。

所有音效和背景音乐都是 **WebAudio 实时合成**的，仓库里一个音频文件都没有。

它是这么小，所以**不需要安装、不需要 Node、不需要联网**。下载一个 HTML 文件，双击，就能玩。

## 立刻开玩

### 方式一：在线玩（最快）

👉 **https://wcbsxe.github.io/neon-fall/**

### 方式二：下载单文件

前往 [**Releases**](https://github.com/wcbsxe/neon-fall/releases/latest) 下载 `neon-fall.html`，保存到任意位置双击即可。

也可以直接下载：[**⬇️ neon-fall.html**](https://github.com/wcbsxe/neon-fall/releases/download/v1.0.0/neon-fall.html)（48 KB）

> 想自己构建这个文件？见下面的「构建单文件版」。

### 方式三：克隆下来折腾

```bash
git clone https://github.com/wcbsxe/neon-fall.git
cd neon-fall
# 直接打开 index.html 即可
```

> `index.html` + `game.js` 是开发版本（外链 JS），`dist/霓虹坠落.html` 是合成好的单文件版本。功能完全一样。

## 操作

| 按键 | 功能 |
|:---|:---|
| <kbd>←</kbd> <kbd>→</kbd> | 左右移动 |
| <kbd>↑</kbd> / <kbd>X</kbd> | 顺时针旋转 |
| <kbd>Z</kbd> | 逆时针旋转 |
| <kbd>↓</kbd> | 软降（+1 分/格） |
| <kbd>空格</kbd> | 硬降（+2 分/格） |
| <kbd>C</kbd> / <kbd>Shift</kbd> | 暂存 / 交换（Hold） |
| <kbd>P</kbd> / <kbd>Esc</kbd> | 暂停 |
| <kbd>R</kbd> | 重新开始 |
| <kbd>M</kbd> / <kbd>N</kbd> | 音乐 / 音效开关 |

**手机上**会自动出现触屏按钮，横屏竖屏都能玩。

## 特性

| | |
|:---|:---|
| 🎲 **标准 7-bag 随机** | 每 7 个方块为一轮，不会连续给你 5 个 S |
| 🧱 **SRS-lite 墙踢** | 贴墙旋转有容错，不会卡死在那里 |
| ⏱️ **锁定延迟 480ms** | 落地后有半秒微调时间，不是硬着陆 |
| 👻 **幽灵方块** | 虚线预览落点，看得清会掉到哪 |
| 🔄 **Hold 暂存** | 存一个方块备用，关键时刻换出来 |
| 🔥 **Combo 连击** | 连续消行有额外加分，越连越爽 |
| ⚡ **等级加速** | 每 10 行升一级，下落越来越快 |
| 🎵 **程序化音频** | 音效 + Am–F–C–G 琶音 BGM（118 BPM），全实时合成 |
| 💾 **最高分保存** | localStorage 本地存储，关掉浏览器也不丢 |
| 📱 **触屏支持** | 手机上自动显示按钮 |

### 手感参数

以下是刻意的调校值，不是随手填的：

| 参数 | 值 | 说明 |
|:---|---:|:---|
| DAS | 150 ms | 按住方向键后，开始连续移动前的延迟 |
| ARR | 42 ms | 连续移动的间隔 |
| 锁定延迟 | 480 ms | 落地后还能继续微调的时间 |
| 重力曲线 | `max(55, 800 × 0.855^(lv-1))` ms/格 | 每升一级变快，55ms 封顶 |

这套数值参考了现代俄罗斯方块的标准手感。如果你觉得哪儿别扭，下面的「调参」章节告诉你怎么改。

---

## 给开发者

### 项目结构

```
neon-fall/
├── index.html              开发版入口（外链 game.js）
├── game.js                 全部游戏逻辑，1302 行，零依赖
├── dist/
│   ├── 霓虹坠落.html        构建产物：自包含单文件
│   ├── 开始游戏.vbs         Windows 启动器（应用模式独立窗口）
│   └── 说明.txt             面向普通玩家的玩法说明
├── tools/
│   ├── build_singlefile.py 把 index.html + game.js 合成单文件
│   └── build_launcher.py   生成 VBS 启动器
├── tests/
│   ├── _engine_test.html   引擎单元测试（23 条断言）
│   ├── cdp_check.js        页面健康检查
│   ├── cdp_keys.js         真实键盘回归（12 条断言）
│   ├── cdp_bot2.js         自动对局 bot
│   └── cdp_live.js         线上部署回归（12 条断言）
├── screenshots/
├── README.md
└── LICENSE
```

### 构建单文件版

```bash
python tools/build_singlefile.py
# → dist/霓虹坠落.html
```

脚本会把 `game.js` 内联进 HTML。它会先检查 JS 里有没有 `</script` 或 `<!--` —— 这两个序列会提前闭合内联标签，有就报错退出。

### 测试

**引擎单元测试** —— 用浏览器打开 `tests/_engine_test.html`，跑完标题栏会显示 `ENGINE failures=N / M`。覆盖：开局状态、棋盘尺寸、单消 / 四消计分、消行后残块下移、next 队列不重复、Hold 存取、左右墙碰撞、旋转可逆性、顶出判负、升级、重力正值。当前 **23 / 23 全绿**。

**浏览器端回归** —— 需要以调试端口启动浏览器：

```bash
# 启动浏览器（Chrome / Edge 均可）
msedge.exe --remote-debugging-port=9334 \
  --user-data-dir="%TEMP%\nfprof" --no-first-run \
  "file:///<项目路径>/index.html"

node tests/cdp_check.js 9334          # 健康检查
node tests/cdp_keys.js  9334          # 键盘回归
node tests/cdp_bot2.js  9334 300      # 自动对局 300 块
```

- `cdp_keys.js` 通过 CDP 派发真实键盘事件，验证从标题到游戏结束的完整交互链路。
- `cdp_bot2.js` 用简化版 Dellacherie 评估函数（聚合高度、空洞数、最大高度、凹凸度、消行奖励）自动打完整局，用来验证消行 / 升级 / 连击 / 计分的整条链路。实测 300 块不 game over。
- `cdp_live.js` 对线上部署的版本跑同样的断言：`node tests/cdp_live.js 9340`

参数顺序是 `端口`、`MAX_PIECES`、`截图保存路径`。

### 调参

想改手感？改这几行就行：

| 想改什么 | 位置 |
|:---|:---|
| 棋盘大小 | [`game.js:10`](game.js#L10) — `COLS = 10, ROWS = 20` |
| 横向移动手感 | [`game.js:35`](game.js#L35) — `DAS = 150, ARR = 42` |
| 锁定延迟 | [`game.js:36`](game.js#L36) — `LOCK_DELAY = 480` |
| 下落速度曲线 | [`game.js:346`](game.js#L346) — `function gravityFor(lv)` |
| 消行得分 | [`game.js:570`](game.js#L570) — `const base = [0, 100, 300, 500, 800][n]` |

改完记得重跑 `tools/build_singlefile.py` 更新单文件版。

方块颜色在 [`game.js:27`](game.js#L27) 的 `COLORS` 对象里，出生位置在 [`game.js:25`](game.js#L25) 的 `SPAWN_X`。

### 调试钩子

游戏暴露了 `window.__NEON_FALL__`，可以在控制台里直接操作：

```js
const N = window.__NEON_FALL__;
N.startGame();          // 开局
N.move(-1);             // 左移一格，返回是否成功
N.tryRotate(1);         // 顺时针，返回是否成功
N.hardDrop();           // 硬降
N.holdPiece();          // 暂存
N.G.board               // 当前棋盘，22×10 的二维数组（20 可见 + 2 行缓冲）
```

自动化测试就是靠这套接口跑的。

---

## 常见问题

<details>
<summary><b>打开后没有声音？</b></summary>

浏览器的自动播放策略：音频必须由用户操作触发。点一下画面或者按任意键就会开始有声音。

如果还是没声音，按 <kbd>M</kbd> 确认音乐开关没关。
</details>

<details>
<summary><b>最高分丢了？</b></summary>

最高分存在浏览器的 localStorage 里，绑定在「这个浏览器 + 这个页面地址」上。

- 换浏览器、换电脑会丢
- 用无痕模式会丢
- 在线版和本地文件版是分开存的（两个不同的 origin）
</details>

<details>
<summary><b>手机能玩吗？</b></summary>

能。页面上有触屏按钮，横屏体验更好。

不过说实话，俄罗斯方块还是键盘玩着舒服。
</details>

<details>
<summary><b>为什么不提供 exe？</b></summary>

早期版本确实做过一个 C# 写的 Windows exe 启动器，但它会触发 **SmartScreen** 拦截（"Windows 已保护你的电脑"）。

原因是未签名的可执行程序缺少代码签名证书和下载信誉，这是 Windows 的通用启发式策略，不是误报——改代码绕不过去。签名证书一年几百块，自签名证书照样显示"未知发布者"。

所以最终改成纯网页交付。没有可执行文件，就绕开了这一整套检查，而且体验上没啥损失。
</details>

<details>
<summary><b>支持哪些浏览器？</b></summary>

任何支持 Canvas 2D + WebAudio 的现代浏览器。在 **Edge** 和 **夸克** 上实测通过（都是 Chromium 内核）。

Safari 和 Firefox 理论上没问题，但没实测过。
</details>

---

## License

[MIT](LICENSE) —— 随便拿去改、拿去玩、拿去发布。

如果这个游戏让你开心了，给个 ⭐ 就行。
