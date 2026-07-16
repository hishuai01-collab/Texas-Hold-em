# poker-server（作业交付）

## 目录结构
```
src/
├── domain/                 # 领域层：纯逻辑，零外部依赖
│   ├── model/types.ts      # Seat / Pot / HandRank / Card
│   └── services/
│       ├── HandEvaluator.ts   # 7选5全牌型评估 + 踢脚比较
│       ├── PotDistributor.ts  # 未跟注退还 / 建池 / 倒序分配 / 守恒校验
│       └── DeckShuffler.ts    # 混合熵洗牌 + 逐张承诺(muck隐私)
├── application/            # 应用层：Actor队列、种子承诺（见设计文档）
└── infrastructure/
    └── audit/MerkleAuditTree.ts  # 确定性叶子 + 域分离 + 包含证明
test/                       # 24个单测，node:test 零框架依赖
```

## 运行测试
```bash
npm install
npx tsx --test test/*.test.ts   # 24 pass
```

## 规格对照
- 弃牌筹码留池、仅失资格 → PotDistributor.buildPots + 单测
- 无限层级边池、倒序分配 → distribute + 4人多层单测
- SHA256(ServerSeed+ClientSeed+HandNonce) → deriveShuffleKey (HKDF，同构更强)
- Muck 隐私 → cardLeaf 逐张承诺（种子不公开广播，见设计文档 §3）
- 确定性叶子、WAL、root 实时下发 → MerkleAuditTree + 设计文档 §4
- 一致性哈希路由 + 快照恢复 → 设计文档 §1
- 余数筹码按钮位顺时针 → clockwiseDist + 双向单测
