# poker-server（作业交付）

## 目录结构
```
src/
├── domain/                 # 领域层：纯逻辑，零外部依赖
│   ├── model/types.ts      # Seat / Pot / HandRank / Card
│   ├── model/User.ts       # User 余额领域模型
│   ├── errors/ErrorCode.ts # 错误码枚举
│   └── services/
│       ├── HandEvaluator.ts   # 7选5全牌型评估 + 踢脚比较
│       ├── PotDistributor.ts  # 未跟注退还 / 建池 / 倒序分配 / 守恒校验
│       └── DeckShuffler.ts    # 混合熵洗牌 + 逐张承诺(muck隐私)
├── application/            # 应用层：Actor队列、种子承诺（见设计文档）
│   ├── HttpApiServer.ts   # HTTP API
│   ├── UserService.ts     # 用户/余额服务
│   ├── TableManager.ts    # 多桌路由
│   └── TableSession.ts    # 单桌会话
├── infrastructure/
│   ├── eventstore/         # Redis Stream / 快照持久化
│   ├── registry/           # 桌子注册表
│   ├── reconnect/          # 重连令牌
│   ├── persistence/        # User/Balance Redis 持久化
│   ├── security/           # 许可证/签名/schema/CORS
│   └── observability/      # Prometheus
├── shared/protocol.ts      # WebSocket 消息类型定义
└── server.ts               # WSS + HTTP 入口
test/                       # 101 个单测
```

## 运行测试
```bash
npm install
npx tsx --test test/*.test.ts   # 101 pass, 0 fail
npm run build                   # tsc 零报错
```

## HTTP API（端口 8081）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/healthz` | 健康检查 |
| POST | `/api/v1/auth/login` | 登录/注册，返回 `token` + `user` |
| GET | `/api/v1/user/me` | 获取当前用户信息（需 `Authorization: Bearer`） |
| POST | `/api/v1/users/register` | 用户注册 |
| GET | `/api/v1/tables` | 大厅牌桌列表 |
| GET | `/api/v1/tables/private/:capability` | 查询私人桌 |
| POST | `/api/v1/tables/create` | 创建私人桌 |

## WebSocket（端口 3001）
- 连接：`ws://host:3001/ws?tableId=<tableId>`
- 鉴权：首条消息发送 `JOIN`（name, clientSeed, clientSeq）
- 断线重连：使用 `RECONNECT` 携带 `reconnectToken`
- 错误响应：`{ type: 'ERROR', code?: string, message: string, traceId: string }`

## 环境变量
| 变量 | 默认 | 说明 |
|------|------|------|
| `REDIS_URL` | - | Redis 连接字符串（生产必填） |
| `ACTION_TIMEOUT_MS` | `15000` | AFK 行动时限 |
| `DISCONNECTED_TIME_BANK_MS` | `15000` | 断线 Time Bank |
| `ALLOWED_ORIGINS` | `*` | CORS 允许来源（逗号分隔） |
| `HTTP_API_PORT` | `8081` | HTTP API 端口 |
| `WSS_PORT` | `3001` | WebSocket 端口 |

## 规格对照
- 弃牌筹码留池、仅失资格 → PotDistributor.buildPots + 单测
- 无限层级边池、倒序分配 → distribute + 4人多层单测
- SHA256(ServerSeed+ClientSeed+HandNonce) → deriveShuffleKey (HKDF，同构更强)
- Muck 隐私 → cardLeaf 逐张承诺（种子不公开广播，见设计文档 §3）
- 确定性叶子、WAL、root 实时下发 → MerkleAuditTree + 设计文档 §4
- 一致性哈希路由 + 快照恢复 → 设计文档 §1
- 余额持久化 → Redis hash `user:{id}` + `RedisUserBalanceRepository`
- 事件溯源 → Redis Stream `poker:table:{tableId}:events`
- 快照持久化 → Redis hash `poker:table:{tableId}:snapshot`
