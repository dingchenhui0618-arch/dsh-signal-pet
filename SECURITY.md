# 安全模型 / Security model

This document describes what **dsh-signal-pet** trusts, what it can see, and what it does with
it. It was read from `src/host.js`, `src/signal.js` and `src/client.cjs`.
**If this document and the code disagree, the code is right and this document is a bug.**

> 一句话：这是一只**只读的状态宠物**。它监听 DSH 的真实事件、在内存里折成一个快照、通过一个
> 不鉴权的本地 HTTP 面喂给前端动画；它不写磁盘、不联网、不执行命令，也**永远不会挡住**它
> 正在报告的工具调用。

## 信任边界

插件跑在 DSH 宿主进程里，两个表面：

| 表面 | 谁在用 | 鉴权 |
| --- | --- | --- |
| 五个事件监听器（`agent/status`、`tools/pre-execute`、`tools/result`、`agent/error`、`agent/turn-stopping`） | DSH 事件总线 | 无；它只能观察 |
| `/dsh-signal-pet` 路由（`ctx.webServer.register`） | 前端的宠物（每 700 ms 轮询） | **插件不鉴权**，只依赖 DSH web server 的访问控制 |

它**不开端口**。路由只有：

- `GET /dsh-signal-pet`（`/state` 是别名）：当前快照、计数、最近工具、错误、忙碌时长、
  配置；未知子路径返回 404。
- `POST /dsh-signal-pet/reset`：内存状态归零。
- `POST /dsh-signal-pet/pulse`：强制一个阶段（默认 `celebrate`），用来验收动画；请求体上限
  256 KiB，`phase` 只接受五个已知阶段，否则当 `celebrate`。

读写什么：

- **不写磁盘**：`src/host.js` 没有 `node:fs`，没有审计日志、没有状态文件；`state.json`
  之类都不存在。`dataDir` 只在 JSDoc/config 里出现，未参与实现。
- 读的是 DSH 事件 payload：工具名、调用 id、错误对象、agent id、turn 结束。它**不读工具
  参数**（`tools/pre-execute` 里只取 `exec.name` / `exec.callId` / `exec.agent`），也不读
  工具结果内容（只取 `result.isError`）。
- 客户端只写浏览器 `localStorage` 的一个键（`dsh-signal-pet.collapsed`），并且只读 DOM 几何
  （`getBoundingClientRect`）与 `querySelectorAll` 来避开输入框。

## 不可信输入

- **事件 payload**：工具名是任意字符串；`agent/error` 的 `error` 可能是对象或字符串，被
  `messageOf` 转成文本；`agent/turn-stopping` 的 agent id 可能缺失或对不上。状态机对未知
  事件返回原状态，不抛异常（`reduce`）。
- **错误文本**：来自工具/宿主的错误消息会进入快照，在宠物标签里截到 60 字符，在
  `GET /dsh-signal-pet` 的 JSON 里保留原文。它**不做脱敏**——错误消息里如果有路径、命令
  片段或令牌，会原样出现在本机面板 / 路由响应里。
- **`POST /pulse` 的 `phase`**：只接受 `idle/thinking/working/error/celebrate`，其它值退回
  `celebrate`；不写入任何持久状态。
- **轮询响应**：client 只用 `data.phase`（白名单校验）、数值字段和文本渲染；DOM 用
  `React.createElement`，**没有 `innerHTML` / `dangerouslySetInnerHTML`**，所以工具名/错误
  文本里的 `<` 不会变成标签。
- **`localStorage` 的值**：只按 `'true'` 读取，其它一律当 `false`。

## 鉴权 / 权限现状（照实写）

- **路由没有自己的鉴权**：`GET` 快照、`POST /reset`、`POST /pulse` 都不检查 header、token、
  Origin，也没有 CSRF 校验。能访问 DSH web server 的本机页面就能读取当前活动元数据、清空
  状态、强制动画。
- **读到的信息有限但真实**：最近工具名、工具总数/失败数、会话 id、忙碌时长、错误文本。
  不是工具参数，也不是文件内容——设计上只从事件里取最小的几个字段。
- **没有「停用」的 HTTP 入口**：`enabled: false` 只能通过插件 config 设置；路由照常应答。
- **它不能拦工具**：`tools/pre-execute` 是 waterfall，监听器在**所有路径**（包括自身异常）
  都调用 `next()`（`host.js`），所以最坏情况是宠物不灵，不会让回合失败。

## 数据与副作用

- **零文件写入、零删除、零网络请求**：没有 `fetch` / `http` / `https`，没有遥测，没有账号
  信息。
- **进程内状态**：`createState()` 里只有计数、运行中的 session、最近工具、错误、庆祝窗口；
  重启即归零。面板的「收起」偏好是浏览器 `localStorage`，与宿主无关。
- **CPU / 轮询**：前端每 700 ms 取一次快照，每 1.5 s 重新量一次布局，并在 resize / scroll /
  focus 时排一次 `requestAnimationFrame`；这些都是常量级开销，但会持续发生。
- **DOM 观察**：只读取元素位置与尺寸，不读取输入框内容，不派发输入事件。

## 已知限制

1. **状态不是审计**：只保留当前回合的聚合（工具总数、失败数、最近一个工具），没有历史、
   没有每个工具的记录、不落盘。重启或 `reset` 后什么都不剩。
2. **错误没有 session 归属**：`agent/error` 的错误是全局的；一个会话的错误会让整只宠物变红，
   直到 TTL（默认 12 s）或下一轮 `agent/status: running` 清掉。
3. **turn-stopping 的兜底是启发式**：payload 没有 agent、或 id 对不上时，如果恰好只有一个
   会话在跑，就把结束归给它；多个会话同时跑时，庆祝可能不触发或归错（`reduce` 的注释写明了
   这个取舍）。
4. **`pulse` 会压过真实错误**：`derivePhase` 里强制阶段排在最前（`signal.js`），所以在
   `celebrateMs`（默认 2.6 s）内，一次强制庆祝可以盖住正在显示的错误。它是显式的验收钩子，
   只能由本机 POST 触发。
5. **错误文本不脱敏**：见「不可信输入」。这是「一眼看到出了什么事」的代价。
6. **单进程、单宠物**：所有会话折叠成一只；它不区分「哪个窗口」。
7. **依赖事件契约**：如果 DSH 改了事件名或 payload 形状，宠物会安静地停在旧状态（监听器
   不抛异常是硬约束），而不是报错。
8. **没有持久化**：`localStorage` 只记「收起」，位置、阶段、计数都不保留。

## 明确不算漏洞的

- `POST /pulse` 能强制庆祝、`POST /reset` 能清空计数——显式的验收/重置钩子，只改内存。
- 能访问路由的人看到最近工具名 / 错误文本——本地面板的设计，见「鉴权现状」。
- 错误消息里带 HTML 不会执行——React 文本节点渲染，没有 `innerHTML`。
- 宠物与输入框重叠时降级为 `vp-blocked`——UX 取舍，不是安全缺陷。
- 重启后状态清零——设计如此，它不是审计工具。
- 一个会话的错误让另一个会话的宠物变红——见限制 2。
- 宠物没有拦住危险工具——它根本没有拦截能力，`next()` 永远被调用。

## 报告漏洞

用 GitHub 的私密渠道：
<https://github.com/dingchenhui0618-arch/dsh-signal-pet/security/advisories/new>

个人项目，**不承诺响应时限**；会读、会修，修完写进 `CHANGELOG.md` 并说明影响范围。请不要把
仍在生效的问题先发到公开 issue。

## 支持范围

只维护**最新一版**（`main` 上的 `0.1.x`）。这个包**尚未发布到 npm**，通过 GitHub 源或本地
目录安装；升级到最新 `main` 即可，更早的提交不再单独回补。
