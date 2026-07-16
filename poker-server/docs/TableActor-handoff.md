# 交接文档：TableActor 双副本现状与收敛方案

> 日期：2026-07-16
> 涉及模块：德州扑克后端 `TableActor`（串行命令执行器 / 单写者原则）

## 一、现状

`TableActor` 目前存在**两份逻辑等价的副本**：

| 副本 | 位置 | 被引用情况 | 差异 |
| --- | --- | --- | --- |
| A. 内联版 | `src/server.ts:7-17` | `server.ts：23` 实例化、`51/68` 调用 | 原始版，无单条 job 错误兜底 |
| B. 独立版 | `src/application/TableActor.ts` | **未被任何文件 import**（纯预留） | 与 A 逻辑一致，仅多一层 `try/catch` 错误兜底 |

两者核心行为一致（并发 ws 消息入队 → 同一时刻仅一个命令改动牌桌状态），因此当前**无功能冲突、无编译问题、运行无害**。

## 二、已知风险

- **双副本漂移**：若未来要改 `TableActor` 行为（如加超时、加日志、加优先级队列），只改一处易忘记另一处，导致运行实例（A）与预留模块（B）行为不一致。
- **B 当前是死代码**：未被导入，仅是"预留独立模块"，对运行时无任何贡献。

## 三、后续决策（二选一）

### 方案 1：作业交付 / 不再迭代 —— 保留现状（最省事）
- 不改动任何文件。
- 代价：仅多一份无害的死代码，不影响运行与维护。

### 方案 2：长期维护 —— 收敛为单份（风险低，随时可做）
将 `server.ts` 改为引用独立版，删除内联版，统一行为来源：

1. `server.ts:1` 区域加入：
   ```ts
   import { TableActor } from './application/TableActor.js';
   ```
2. 删除 `server.ts:7-17` 的内联 `class TableActor`。
3. 保留 `actor = new TableActor()`（`server.ts:23`）不变。

**收益**：单一事实来源，杜绝漂移；独立版自带的 `try/catch` 错误兜底顺带覆盖全部调用点。
**风险**：低。纯机械替换，逻辑等价，可先用 `tsx` 启动 + `simple-client.html` 跑一局验证（JOIN → START → ACTION 链路无报错即为通过）。

## 四、快速验证清单（若执行方案 2）

- `npx tsx src/server.ts` 启动无编译错误。
- 浏览器打开 `frontend-demo/simple-client.html`，多标签页模拟多玩家。
- 链路：`加入` → `开始` → 依次 `过牌/跟注/弃牌`，控制台与座位面板正常刷新，无 `ERROR` 推送异常。

## 五、变更记录（精简跟进）

- 07-16 server.ts:34 加安全日志：`[emit] TYPE (broadcast|→id前8位)`，不转储牌面/种子；已重启验证。
- 07-16 新增 frontend-demo/simple-client.html、frontend-demo/index.html（联调模板）。
- 07-16 新增 client/index.html（simple-client 副本，供双击打开）。
- 07-16 MVP 闭环验证通过：JOIN→START→ACTION_APPLIED 链路正常，无报错。
- 07-16 澄清：frontend-demo 仅含 index.html/simple-client.html（大写事件协议），**无 App.vue/useGame.ts**；所谓小写 state 快照协议不存在，方案 A 无改造对象，无需改动。新建 Vue3 前端时按方案 A 直接基于后端事件协议写 useGame.ts。
