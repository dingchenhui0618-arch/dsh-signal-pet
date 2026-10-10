# dsh-signal-pet

一只住在界面角落的小宠物，它**读你真实的会话事件**：思考时动得更快，有工具在跑时拉出连线，出错时变红发抖，长任务做完时庆祝一下。

A status pet for DeepSeek Harness. It reacts to the live event stream — thinking, tool calls, errors, long-job completion — and doubles as the busy/error indicator you can actually see at a glance.

## 它解决什么

"宠物"这个形式的问题从来不是不好玩，而是**看完不知道该看什么**。所以这只宠物有两个身份，而且是同一个东西：

- **好玩的那面**：它会动，会庆祝，点一下会收起来。
- **有用的那面**：它同时是**一眼可见的忙碌/出错指示器**。你不用去翻日志、也不用盯着转圈——出错了它就是红的，在抖；在跑工具它就是紫的，有几条线就有几个工具在跑。

它不做内容识别、不做装饰、不挡你打字。**位置会主动避开输入框**——一只趴在你正在打字的框上的宠物是障碍物，不是装饰。

## 状态

宠物的状态**不是客户端猜的**。宿主半区监听真实的 harness 事件，折叠成一个小快照，客户端只负责画：

| 状态 | 触发 | 表现 |
| --- | --- | --- |
| `idle` | 没有活跃会话 | 慢慢上下飘 |
| `thinking` | `agent/status` 变 running | 同样的动作，速度快 3 倍多 |
| `working` | 有工具正在执行 | 紫色环 + 每个运行中的工具拉一条流动的连线 |
| `error` | `tools/result` 报错，或 `agent/error` | 红环 + 抖 5 下 + 显示错误摘要 |
| `celebrate` | 一个**跑了 10 秒以上**的回合结束 | 跳 4 下 + 三颗火花 |

**优先级是产品决定，不是巧合**：错误压过一切。哪怕同时在跑工具，只要刚出过错，宠物就是红的——它的职责就是"出事的时候你一定会注意到"。

## 装

```sh
# npm 版 CLI 管理的 profile
dsh plugin --profile <name> add <插件目录>

# 桌面版：desktop profile 由 Electron app 独占，npm 版 CLI 会被拒绝——
#   error: profile "desktop" is managed exclusively by the Electron application
# 用它自带的那个 CLI 才行（在 app 的 resources/runtime/cli/bin/dsh 下）：
"<app>/resources/runtime/cli/bin/dsh" plugin --profile desktop add <插件目录>
```

装完重启一次 app（host 半区必须重启进程才会加载）。

## 用

- **点一下宠物** —— 收成一个小圆点，只留状态环颜色；再点一下展开。选择记在 `localStorage`。
- **`data-pet-state`** —— 宠物根元素和图层上都带这个属性，值就是当前状态（`idle`/`thinking`/`working`/`error`/`celebrate`），所以截图验收、自动化断言、CSS 钩子都有稳定的抓手。
- **`data-pet-mode`** —— 图层上是 `animated` / `static` / `collapsed`。

## 避让 UI

宠物的位置在五个候选角里挑**第一个完全不重叠**的；都不行就挑**重叠最小**的，并把 `clear: false` 落成一个类名（`vp-blocked`），这样界面能说明它没能让开，而不是假装让开了。

障碍物是**按行为识别**的，不是按 DSH 的类名：

```
textarea, input, [contenteditable="true"], [role="textbox"], [data-pet-avoid]
```

外加**当前获得焦点的元素**（哪怕它不是上面任何一类）。`data-pet-avoid` 是留给其他插件和你自己的逃生口——任何你想要宠物避开的东西，加上这个属性就行。

匹配行为而不匹配类名，是因为 DSH 的界面样式下一次重构时，类名会变，而"这是一个输入框"不会变。

## 无障碍

`prefers-reduced-motion: reduce` 时，宠物**退化成静态角标**：所有 keyframe 关闭，身体缩成 22px 圆点，**但状态环的颜色和文字标签保留**。

这是刻意的取舍——减弱动效不等于减弱信息。指针仍然必须能传达"现在在忙"和"刚才出错了"，只是不再靠运动传达。

## 和原版的关系

灵感来自 **[9livewolf/dsh-think-bounce-pet](https://github.com/9livewolf/dsh-think-bounce-pet)**（17 stars）。

**原版没有任何 LICENSE 文件**，也就是默认「保留所有权利」。所以本插件**没有复用它的任何一行代码**，也没有 clone 它——只读了它的 README 来弄清它做了什么、缺什么，实现是从零写的。这一点值得写清楚，不是客套。

**原版实际做了什么**（据它的 README）：两只大肥鱼在界面里弹跳，作者自己写的是「**无实意**」；有常驻球和**思考球**（推理开始时飞入、结束时缩小消失）；支持鼠标碰撞、重力、初速度、摩擦、大小等实时参数；有设置页；参数存在 localStorage；挂在 `shell.overlay`，全屏 `pointer-events:none` 图层。

所以差异**不在"接不接会话状态"**——原版确实接了思考状态。差异在接得有多细、以及有没有把它当指示器用：

| | 原版 | 本插件 |
| --- | --- | --- |
| 会话状态 | 只有推理开始/结束 | `agent/status`、`tools/pre-execute`、`tools/result`、`agent/error`、`agent/turn-stopping` 五种事件 |
| 工具调用 | 不反映 | 每个运行中的工具一条流动连线，`data` 里带次数与最近一次的名称/耗时/是否失败 |
| 错误 | 不反映 | 红环 + 抖动 + 错误摘要，且**优先级最高** |
| 完成 | 不反映 | 跑满 10 秒的回合结束时庆祝一次 |
| 避让 UI | 不避让 | 五候选角落 + `getBoundingClientRect` 避开输入框与焦点元素 |
| 无障碍 | 不响应 | `prefers-reduced-motion` 退化成静态角标（保留状态颜色与文字） |
| 可验收 | 无稳定抓手 | `data-pet-state` / `data-pet-mode` |
| 物理 | 重力、抛出、鼠标碰撞、实时参数面板 | **没有** |
| 设置页 | 有 | **没有**（只有一个点击收起） |

最后两行是原版**比我强**的地方，直说。我没有实现物理引擎，因为那部分不服务于"一眼可见的指示器"这个目标，而重写一个物理系统也不是这次改进要解决的问题。

## HTTP 面

```
GET  /dsh-signal-pet          当前快照（phase、计数、最近工具、错误、忙碌时长）
GET  /dsh-signal-pet/state    同上（别名）
POST /dsh-signal-pet/reset    清空状态
POST /dsh-signal-pet/pulse    强制触发一次庆祝（用来验收动画，不用真的等一个长任务）
```

## 它绝不干扰工作

这一条是硬约束。`tools/pre-execute` 是**决定一个工具会不会被执行**的 waterfall，所以宿主的监听器**在任何路径上都会到达 `next()`**——包括它自己内部出错的时候。一个能挡住它所报告的工作的状态指示器，比没有指示器更糟。

其余同理：状态折叠、事件记录、路由注册全部包在 try/catch 里，任何一处失败都只是宠物不灵，不会让回合失败。

## 容错姿态

- **`webServer.register` 失败**只是没有 HTTP 面（宠物不显示），事件监听照常工作。
- **宿主侧 `enabled: false`** 时接口照常应答，只是不再记录事件。
- **`shell.overlay` 注册失败**只让这一层降级并打日志，不会让整个客户端启动失败。
- **localStorage 被禁用**只影响"收起"这个偏好，不影响宠物本身。
- **窗口尺寸为 0** 时位置计算返回有限数值，不产生 NaN。
- **每次注册都可撤销**（`ctx.effect`），因为 dsh 能在运行期卸载插件。

## 配置

`apply(ctx, config)` 的 config 全部可覆盖：

| key | 默认 | 说明 |
| --- | --- | --- |
| `errorTtlMs` | `12000` | 错误在宠物上停留多久，之后回落到"现在正在发生什么" |
| `celebrateMs` | `2600` | 一次庆祝持续多久 |
| `celebrateAfterMs` | `10000` | 回合至少跑这么久才值得庆祝。低于它就只是普通结束，每次都庆祝等于噪声 |
| `maxTethers` | `6` | 最多画几条连线（同时跑 20 个工具时不该糊满屏幕） |
| `enabled` | `true` | 关掉后事件不再记录 |

## 开发

```sh
node --test          # 67 个测试
node scripts/build.mjs
```

**状态机是纯的**（`src/signal.js`：无定时器、无 I/O、不改输入），所以"什么时候该庆祝""错误什么时候该消"这类判断全部由单测钉死，不需要跑起来看。

**阶段是每次读取时推导出来的，不是存下来的。** 错误会过期、庆祝有窗口，如果把 phase 当状态存，就需要一个定时器去清除它——而依赖定时器的状态机，总会有一次定时器没响然后永久卡在 `error`。

**避让定位和动效降级也是纯函数**，通过 `__test` 暴露。这两块最典型的坏法都是"看起来没问题"：宠物悄悄不再避让输入框，或者对要求减少动效的人继续动。它们不需要 DOM 就能验，所以就被验了。

**渲染层也被真的渲染过一遍**（`test/client.test.mjs`：结构化 stub 掉 React 与浏览器全局，然后调用注册进去的组件，像 React 一样执行函数组件再走整棵树）。这不是为了覆盖率好看——`data-pet-state` 和 reduced-motion 降级这两个承诺只存在于渲染结果里，而"看着没问题"正是一个坏掉的指示器最常见的存活方式。

## License

MIT
