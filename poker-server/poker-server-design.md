# 德州扑克服务端架构设计（修正版）

## 0. 信任模型 —— 先说清防什么

诚实的设计从边界开始，不喊"无懈可击"。

| 威胁 | 是否防御 | 手段 |
|---|---|---|
| 客户端改内存/伪造状态 | ✅ | 服务端权威状态机，客户端只是显示器 |
| 重放/乱序指令 | ✅ | 每桌单调序列号 + 领域层校验行动人 |
| 并发竞态导致资损 | ✅ | 每桌单写者（Actor），无锁串行 |
| 事后换牌/篡改历史 | ✅ | commit-reveal + 事件哈希链 + Merkle root 实时下发 |
| 服务端预先挑选有利种子 | ✅ | 客户端熵混入洗牌（见 §3） |
| **内部人实时读内存看牌** | ⚠️ 部分 | 种子仅存于发牌进程；生产环境需 HSM/TEE 或双方分片持钥。纯软件无法根除 |
| **玩家串通（合伙打牌）** | ❌ | 属行为风控范畴（统计检测），不在本架构内 |

历史上真实扑克平台出事（UltimateBet 超级账户）都是内部人问题，不是外挂问题。任何声称"数学上防内鬼"的纯软件方案都是虚标。

---

## 1. 拓扑：单写者 + 一致性哈希，不要两头骑墙

原方案一边说"内存队列防并发"，一边画"Redis 分布式锁 + 分库分表"，自相矛盾。定死：

```
客户端 ──WSS──> 网关层（无状态，可横向扩）
                  │  按 tableId 一致性哈希路由
                  ▼
            游戏节点 N 台
            每桌 = 一个 Actor（内存 FIFO 队列 + 单循环消费）
            同一桌永远只落在一个节点 → 天然无竞态，不需要任何锁
                  │  同步写
                  ▼
            事件存储（append-only WAL）= 唯一事实来源
```

- **Redis 只放**：session、桌→节点路由表。不放游戏状态。
- **崩溃恢复**：节点挂了，桌迁移到新节点，重放事件流重建状态。关键动作（All-in / 加注 / 进入摊牌）后额外写一份状态快照（含加密后的 serverSeed），回放时从最近快照起步，恢复更快。进行中的手牌：`serverSeed` 在开局时已用 KMS 信封加密落盘，可解密续局；作业版可简化为"废弃该手、按事件流退还各玩家投入"（事件流里有完整 contributed 记录，退款是确定性的）。
- 原方案 seed 只在内存 → 节点一挂这手牌永远无法验证，这是硬伤。

---

## 2. 领域层：资金流水线（修掉资损 bug）

原方案 `rebuildPots` 只统计未弃牌玩家 → **弃牌玩家投入的筹码凭空蒸发**。正确的记账模型：

1. 每个玩家维护 `contributed`（本手总投入，**弃牌后保留**）。
2. 摊牌前先做 **未跟注退还**：最高投入超出第二高的部分退回下注者（真实规则）。
3. 用**所有投入者**（含弃牌）的 contributed 分层切池；**资格列表**只含未弃牌者。
4. 从最高边池倒序分配；资格集合相同的相邻池合并，避免碎池。
5. 余数筹码：给**按钮位顺时针第一个赢家**（确定性、可重放），不是"数组第一个"——排序遇同分时数组顺序未定义，重放审计会对不上。

### 核心代码

```ts
interface Seat {
  id: string;
  seatIndex: number;      // 用于余数筹码的确定性分配
  chips: number;
  contributed: number;    // 本手总投入，弃牌后保留
  folded: boolean;
  holeCards: string[];
}

interface Pot { amount: number; eligible: string[]; }

/** 步骤2：退还未被跟注的部分（摊牌/弃牌结束前必须先调） */
function returnUncalled(seats: Seat[]): void {
  const byContrib = [...seats].sort((a, b) => b.contributed - a.contributed);
  const top = byContrib[0];
  const second = byContrib[1]?.contributed ?? 0;
  if (top.contributed > second) {
    const refund = top.contributed - second;
    top.chips += refund;
    top.contributed -= refund;
  }
}

/** 步骤3：建池 —— 金额来自所有投入者，资格只给未弃牌者 */
function buildPots(seats: Seat[]): Pot[] {
  const contributors = seats.filter(s => s.contributed > 0);
  const levels = [...new Set(contributors.map(s => s.contributed))]
    .sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of contributors) {
      amount += Math.max(0, Math.min(s.contributed, level) - prev);
    }
    const eligible = seats
      .filter(s => !s.folded && s.contributed >= level)
      .map(s => s.id);

    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (last && sameSet(last.eligible, eligible)) {
        last.amount += amount;          // 弃牌只送钱不改资格 → 合并
      } else {
        pots.push({ amount, eligible });
      }
    }
    prev = level;
  }
  return pots;
}

/** 步骤4/5：倒序分配 + 确定性余数规则 */
function distribute(
  pots: Pot[], seats: Seat[], community: string[], buttonIndex: number
): Map<string, number> {
  const win = new Map<string, number>();
  const byId = new Map(seats.map(s => [s.id, s]));

  for (let i = pots.length - 1; i >= 0; i--) {
    const pot = pots[i];
    const contenders = pot.eligible
      .map(id => byId.get(id)!)
      .filter(s => !s.folded);
    if (contenders.length === 0 || pot.amount === 0) continue;

    let winners: Seat[];
    if (contenders.length === 1) {
      winners = contenders;
    } else {
      const ranked = contenders.map(s => ({
        s, rank: evaluateBestHand([...s.holeCards, ...community]),
      }));
      const best = ranked.reduce((m, r) => compareRank(r.rank, m.rank) > 0 ? r : m);
      winners = ranked
        .filter(r => compareRank(r.rank, best.rank) === 0)
        .map(r => r.s);
    }

    // 余数：按钮位顺时针最近的赢家优先，每人至多多得 1
    winners.sort((a, b) =>
      clockwiseDist(buttonIndex, a.seatIndex) - clockwiseDist(buttonIndex, b.seatIndex));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount % winners.length;
    for (const w of winners) {
      const bonus = remainder > 0 ? 1 : 0;
      remainder -= bonus;
      win.set(w.id, (win.get(w.id) ?? 0) + share + bonus);
    }
  }
  return win;
}

const clockwiseDist = (from: number, to: number, n = 9) => ((to - from) % n + n) % n || n;
```

**不变量校验**（每手结束必跑，防资损的最后一道闸）：
`Σ 分配额 + Σ 退款 === Σ contributed(原始)`，不等则该手冻结、告警、人工介入。

---

## 3. 可验证公平：commit-reveal + 客户端熵

原方案的 commit-reveal 只证"事后没换种子"，不证"事前没挑种子"——服务端可以生成一万个种子挑对自己有利的再承诺。修法：**洗牌密钥必须混入玩家提供的熵**，服务端承诺在先、玩家熵在后，双方都无法单独操控结果。

### 每手牌时序

```
1. 服务端: serverSeed = random(32B), 广播 commitment = SHA256(serverSeed ‖ salt)
2. 各玩家: 提交 clientSeed（客户端自动生成即可），服务端广播全部 clientSeeds
3. 发牌:   shuffleKey = HKDF(serverSeed, salt = handId,
                              info = concat(sort(clientSeeds)))
           牌序 = FisherYates(deck, DRBG(shuffleKey))
4. 手牌结束: 广播 serverSeed + salt
5. 客户端:  验 commitment，本地重跑 HKDF + 洗牌，比对已知牌
```

- 服务端想操控结果 → 必须在收到 clientSeeds **之后**换 serverSeed → commitment 对不上。
- 玩家想操控结果 → 不知道 serverSeed，clientSeed 怎么选都是均匀分布。

```ts
import { createHmac, hkdfSync, randomBytes } from 'crypto';

function deriveShuffleKey(serverSeed: Buffer, handId: string, clientSeeds: string[]): Buffer {
  const info = Buffer.from(clientSeeds.slice().sort().join('|'));
  return Buffer.from(hkdfSync('sha256', serverSeed, Buffer.from(handId), info, 32));
}

/** HMAC 计数器流 + 拒绝采样 → 无偏 Fisher-Yates */
function shuffle(deck: string[], key: Buffer): string[] {
  const out = [...deck];
  let ctr = 0, pool = Buffer.alloc(0), pos = 0;
  const nextByte = () => {
    if (pos >= pool.length) {
      pool = createHmac('sha256', key).update(String(ctr++)).digest();
      pos = 0;
    }
    return pool[pos++];
  };
  const randBelow = (n: number) => {          // 拒绝采样，杜绝模偏差
    const limit = Math.floor(256 / n) * n;
    let b: number;
    do { b = nextByte(); } while (b >= limit);
    return b % n;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = randBelow(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

**Muck 隐私（重要冲突与解法）**：直接揭示 serverSeed = 揭示整副牌序，弃牌玩家底牌全部曝光，违反 Muck 规则。而"公开揭示种子"和"弃牌底牌保密"在数学上不可兼得——种子能重算整副牌。工程解法是**逐张承诺**：

1. 洗牌照旧用混合种子（§3 时序不变），但开局广播的不是种子承诺一项，而是**牌堆 Merkle root**：每张牌 `leaf = SHA256(pos ‖ card ‖ perCardSalt)`，`perCardSalt = HMAC(shuffleKey, pos)`。
2. 游戏中每亮出一张牌（公共牌、摊牌亮出的底牌），附带该牌的 `(card, salt, inclusion proof)` —— 客户端即时验证这张牌在开局就定好、未被调换。
3. **弃牌玩家的底牌永不揭示**，其叶子哈希留在树里但无人能反推（有 salt 保护）。
4. serverSeed 本身不公开广播，仅在争议仲裁时向独立审计方出示（可完整验证洗牌随机性含客户端熵混入）。

代价：日常玩家验证的是"牌未被换"而非"洗牌全程随机"，后者降级为审计通道能力。这是保 Muck 隐私的必要代价，写进文档明说。`DeckShuffler.ts` 中 `cardLeaf()` 已实现。

**明说的残余风险**：发牌进程运行期知道全部底牌。生产环境缓解：种子放 HSM/TEE、发牌服务与业务服务进程隔离、运维四眼原则。写进文档，不假装不存在。

---

## 4. 审计：哈希链 + Merkle + 实时下发 root

原方案三个致命伤：① 叶子哈希混了 `Date.now()`，客户端永远无法重算 → 不可验证；② 攒 1000 条才落盘，崩溃全丢；③ root 只存自己库里 = 自己给自己作证。修正：

1. **事件即真相**：每条领域事件同步写 append-only WAL（先落盘，后广播）。事件体自带 `seq`、`handId`、`ts`、`prevEventHash`——时间戳是**事件数据的一部分**，参与哈希但可重算。
2. **确定性叶子**：`leaf = SHA256(0x00 ‖ canonicalJSON(event))`，内部节点 `SHA256(0x01 ‖ L ‖ R)`（RFC 6962 风格域分离，防第二原像拼接攻击）。canonicalJSON = 键排序、无多余空白。
3. **每手一棵树**：手牌结束时构树，**root 随结算消息实时推给全桌玩家**。玩家手里有 root，服务端事后想重写历史 → 和已下发的 root 对不上。这一步才是防篡改的关键，root 躺在自家数据库里毫无意义。
4. **外部锚定**（可选加分项）：每日把 root 链的头哈希发布到第三方（对象存储 WORM / OpenTimestamps / 公开页面），彻底堵死"整库重写"。
5. 客户端可随时请求任意事件的 inclusion proof。

```ts
function canonicalJSON(o: unknown): string {
  if (Array.isArray(o)) return `[${o.map(canonicalJSON).join(',')}]`;
  if (o && typeof o === 'object') {
    return `{${Object.keys(o).sort()
      .map(k => `${JSON.stringify(k)}:${canonicalJSON((o as any)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(o);
}

const leafHash = (e: object) =>
  createHash('sha256').update(Buffer.concat([Buffer.from([0]),
    Buffer.from(canonicalJSON(e))])).digest();

const nodeHash = (l: Buffer, r: Buffer) =>
  createHash('sha256').update(Buffer.concat([Buffer.from([1]), l, r])).digest();
```

---

## 5. 与原方案差异对照

| 项 | 原方案 | 本方案 |
|---|---|---|
| 弃牌玩家筹码 | 建池时被过滤 → **蒸发** | contributed 保留入池，仅失去资格 |
| 未跟注退还 | 无 | 有（真实规则） |
| 余数筹码 | 数组第一个（不确定） | 按钮位顺时针第一赢家（确定、可重放） |
| 种子公平性 | 仅防事后换牌 | 客户端熵混入，防事前挑种子 |
| seed 持久化 | 仅内存，崩溃即失 | KMS 加密落盘，可恢复/可验证 |
| 审计叶子 | 混 Date.now()，不可重算 | canonical JSON + 域分离，可验证 |
| 审计落盘 | 攒 1000 条，崩溃全丢 | 每事件同步 WAL |
| root 去向 | 存自己库 | 实时推给玩家 + 外部锚定 |
| 分布式立场 | 内存队列与分布式锁并存（矛盾） | 单写者 + 一致性哈希路由，明确无锁 |
| 内鬼威胁 | 声称"无懈可击" | 明示为残余风险 + 缓解措施 |
| 资金对账 | 无 | 每手不变量校验，不等即冻结 |

---

## 6. 一句话总结

架构骨架（六边形 + Actor + 事件溯源 + commit-reveal + Merkle）方向本来就对；这版补上的是**弃牌筹码记账、客户端熵、确定性余数、可验证叶子、root 实时下发、崩溃恢复**这六个让它从"PPT 正确"变成"跑起来不丢钱、出纠纷能自证"的细节。写作业时把 §0 的信任模型放最前面——知道自己防不了什么，比宣称什么都防得了，分高得多。
