import { reactive, ref } from 'vue';
import { verifyHand, type VerifyResult } from '../utils/verify';

export interface SeatView {
  id: string; name: string; seatIndex: number; chips: number;
  contributed: number; roundBet: number; folded: boolean;
  holeCards: string[] | null;
}
export interface Snapshot {
  handId: string; street: string; community: string[]; pot: number;
  currentBet: number; toAct: number | null; button: number; seats: SeatView[];
  lastResult?: { winnings: Record<string, number>; reveal?: any };
  commitment?: { hash: string; salt: string; clientSeeds: string[] };
}

const WS_URL = (import.meta as any).env?.VITE_WS_URL ?? 'ws://localhost:8090';

export function useGame() {
  const connected = ref(false);
  const playerId = ref('');
  const mySeat = ref(-1);
  const snap = ref<Snapshot | null>(null);
  const log = reactive<string[]>([]);
  const verify = ref<VerifyResult | null>(null);
  const verifying = ref(false);
  const errorMsg = ref('');
  // 客户端熵：每局本地生成，参与洗牌密钥派生 —— 服务端无法单方面操控牌序
  const myClientSeed = ref(randSeed());
  let ws: WebSocket | null = null;
  let lastVerifiedHand = '';

  function randSeed(): string {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function connect(name: string) {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      connected.value = true;
      ws!.send(JSON.stringify({ type: 'join', name, clientSeed: myClientSeed.value }));
      log.unshift('已连接服务端');
    };
    ws.onclose = () => { connected.value = false; log.unshift('连接断开'); };
    ws.onmessage = async ev => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'joined') {
        playerId.value = msg.playerId;
        mySeat.value = msg.seatIndex;
      } else if (msg.type === 'error') {
        errorMsg.value = msg.message;
        setTimeout(() => (errorMsg.value = ''), 2500);
      } else if (msg.type === 'state') {
        const prev = snap.value;
        snap.value = msg.snapshot as Snapshot;
        if (prev?.handId !== snap.value.handId && snap.value.handId) {
          verify.value = null;
          log.unshift(`新一手 ${snap.value.handId.slice(-6)} · 承诺已封存 ${snap.value.commitment?.hash.slice(0, 12)}…`);
        }
        const reveal = snap.value.lastResult?.reveal;
        if (reveal && lastVerifiedHand !== reveal.handId) {
          lastVerifiedHand = reveal.handId;
          await runVerify(reveal);
        }
      }
    };
  }

  /** 揭示到达 → 本地重跑洗牌验证（Provably Fair 的"验"就在这里发生） */
  async function runVerify(reveal: any) {
    if (!snap.value?.commitment) return;
    verifying.value = true;
    try {
      // 收集本客户端亲眼见过的牌 → 牌堆位置映射（按服务端发牌约定）
      const known = new Map<number, string>();
      const inHand = snap.value.seats.filter(s => s.holeCards !== null || s.folded || true);
      const dealt = snap.value.seats.length; // 全员参与本 demo
      snap.value.community.forEach((c, i) => known.set(dealt * 2 + i, c));
      snap.value.seats.forEach((s, k) => {
        if (s.holeCards) { known.set(2 * k, s.holeCards[0]); known.set(2 * k + 1, s.holeCards[1]); }
      });
      void inHand;
      verify.value = await verifyHand(reveal, snap.value.commitment.hash, known);
      const v = verify.value;
      log.unshift(v.commitmentOk && v.cardsMatched === v.cardsChecked
        ? `✔ 验证通过：承诺匹配，${v.cardsMatched}/${v.cardsChecked} 张已知牌与本地重放一致`
        : `✘ 验证失败！承诺${v.commitmentOk ? '匹配' : '不匹配'}，牌面 ${v.cardsMatched}/${v.cardsChecked}`);
    } finally {
      verifying.value = false;
    }
  }

  function startHand() {
    myClientSeed.value = randSeed(); // 每手换新熵
    ws?.send(JSON.stringify({ type: 'start', clientSeed: myClientSeed.value }));
  }
  function act(type: string, amount?: number) {
    ws?.send(JSON.stringify({ type: 'action', action: { type, amount } }));
  }

  return { connected, playerId, mySeat, snap, log, verify, verifying,
    errorMsg, myClientSeed, connect, startHand, act };
}
