// 浏览器端公平性验证 —— 与服务端 DeckShuffler.ts 逐字节对齐
// 验证三件事：① 承诺哈希匹配 ② 本地重跑洗牌 ③ 已知牌（公共牌+自己底牌）与重放一致

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) =>
  new Uint8Array(h.match(/.{2}/g)!.map(x => parseInt(x, 16)));

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** 对齐服务端：commitment = SHA256(serverSeedHex + saltHex) */
export async function verifyCommitment(
  serverSeedHex: string, saltHex: string, commitment: string,
): Promise<boolean> {
  return (await sha256Hex(serverSeedHex + saltHex)) === commitment;
}

/** 对齐 node hkdfSync('sha256', seed, salt=handId, info=sortedClientSeeds, 32) */
async function deriveShuffleKey(
  serverSeedHex: string, handId: string, clientSeeds: string[],
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', fromHex(serverSeedHex), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(handId),
      info: enc.encode([...clientSeeds].sort().join('|')) },
    ikm, 256,
  );
  return crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** 对齐服务端：HMAC 计数器流 + 拒绝采样 Fisher-Yates */
export async function replayShuffle(
  serverSeedHex: string, handId: string, clientSeeds: string[],
): Promise<string[]> {
  const key = await deriveShuffleKey(serverSeedHex, handId, clientSeeds);
  const RANKS = '23456789TJQKA', SUITS = 'shdc';
  const deck = [...RANKS].flatMap(r => [...SUITS].map(s => r + s));

  let ctr = 0, pool = new Uint8Array(0), pos = 0;
  const nextByte = async (): Promise<number> => {
    if (pos >= pool.length) {
      pool = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(String(ctr++))));
      pos = 0;
    }
    return pool[pos++];
  };
  const randBelow = async (n: number): Promise<number> => {
    const limit = Math.floor(256 / n) * n;
    let b: number;
    do { b = await nextByte(); } while (b >= limit);
    return b % n;
  };
  for (let i = deck.length - 1; i > 0; i--) {
    const j = await randBelow(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface VerifyResult {
  commitmentOk: boolean;
  cardsChecked: number;
  cardsMatched: number;
  replayedDeckPrefix: string[];
}

/** 完整验证：known = 客户端本局亲眼见过的 (deckPos → card) 映射 */
export async function verifyHand(
  reveal: { serverSeed: string; salt: string; handId: string; clientSeeds: string[] },
  commitment: string,
  known: Map<number, string>,
): Promise<VerifyResult> {
  const commitmentOk = await verifyCommitment(reveal.serverSeed, reveal.salt, commitment);
  const deck = await replayShuffle(reveal.serverSeed, reveal.handId, reveal.clientSeeds);
  let matched = 0;
  for (const [posIdx, card] of known) if (deck[posIdx] === card) matched++;
  return {
    commitmentOk,
    cardsChecked: known.size,
    cardsMatched: matched,
    replayedDeckPrefix: deck.slice(0, 12),
  };
}
