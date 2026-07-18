import type { Card } from '../model/types.js';
import { evaluateBest } from './HandEvaluator.js';

export type Personality = 'loose-aggressive' | 'tight-aggressive' | 'tight-passive' | 'calling-station';

interface PersonalityProfile {
  /** 想主动下注/加注的倾向 */
  aggression: number;
  /** 面对下注时愿意继续的最低强度门槛 */
  tightness: number;
  /** 不看牌力强行下注/加注的概率（诈唬） */
  bluffRate: number;
  /** 牌力不够时仍然跟注的倾向（松弱型玩家特征） */
  loose: number;
}

const PROFILES: Record<Personality, PersonalityProfile> = {
  'loose-aggressive': { aggression: 0.55, tightness: 0.15, bluffRate: 0.22, loose: 0.35 },
  'tight-aggressive': { aggression: 0.45, tightness: 0.40, bluffRate: 0.10, loose: 0.05 },
  'tight-passive': { aggression: 0.12, tightness: 0.38, bluffRate: 0.04, loose: 0.10 },
  'calling-station': { aggression: 0.08, tightness: 0.05, bluffRate: 0.02, loose: 0.55 },
};

const PERSONALITY_WEIGHTS: [Personality, number][] = [
  ['loose-aggressive', 0.25],
  ['tight-aggressive', 0.3],
  ['tight-passive', 0.25],
  ['calling-station', 0.2],
];

export function randomPersonality(): Personality {
  const total = PERSONALITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [name, weight] of PERSONALITY_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return 'tight-passive';
}

const RANK: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 翻牌前无公共牌可看，用简化版起手牌评分（不追求精确胜率，只求排序大致合理）。 */
function preflopStrength(hole: Card[]): number {
  const r1 = RANK[hole[0][0]];
  const r2 = RANK[hole[1][0]];
  const suited = hole[0][1] === hole[1][1];
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const pair = r1 === r2;

  let score: number;
  if (pair) {
    score = hi * 2;
  } else {
    score = hi;
    if (suited) score += 2;
    const gap = hi - lo - 1;
    if (gap === 0) score += 1;
    else if (gap === 1) score += 0.5;
    else if (gap >= 4) score -= 2;
    if (lo >= 10) score += 1;
  }
  return clamp((score - 2) / 26, 0, 1);
}

/** 有公共牌时用真实牌型评估器打分，category(0-9) 为主，同类内用最大踢脚微调排序。 */
function madeHandStrength(hole: Card[], board: readonly Card[]): number {
  const rank = evaluateBest([...hole, ...board]);
  const base = rank.category / 9;
  const kicker = ((rank.tiebreak[0] ?? 0) / 14) * (1 / 9);
  return clamp(base + kicker * 0.5, 0, 1);
}

export function handStrength(hole: Card[], board: readonly Card[]): number {
  if (board.length < 3) return preflopStrength(hole);
  return madeHandStrength(hole, board);
}

export interface BotDecisionInput {
  personality: Personality;
  strength: number;
  toCall: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  raiseAllowed: boolean;
  chips: number;
}

export interface BotDecision {
  action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE';
  amount?: number;
}

function sizedRaise(minRaiseTo: number, maxRaiseTo: number, profile: PersonalityProfile): BotDecision {
  const span = Math.max(0, maxRaiseTo - minRaiseTo);
  const aggressionFactor = 0.2 + profile.aggression * 0.8;
  const target = Math.round(minRaiseTo + span * Math.min(1, Math.random() * aggressionFactor * 1.5));
  return { action: 'RAISE', amount: clamp(target, minRaiseTo, maxRaiseTo) };
}

/**
 * 纯函数决策：性格权重 + 牌力 + 一点随机噪声，产出一个动作。
 * 不追求 GTO 最优解，只求"看起来像真人在打"——会诈唬、会弃牌、加注尺度不固定。
 */
export function decideAction(input: BotDecisionInput): BotDecision {
  const { personality, strength, toCall, minRaiseTo, maxRaiseTo, raiseAllowed, chips } = input;
  const profile = PROFILES[personality];
  const canRaise = raiseAllowed && minRaiseTo <= maxRaiseTo && chips > 0;
  const noise = (Math.random() - 0.5) * 0.3;
  const effStrength = clamp(strength + noise, 0, 1);
  const bluff = Math.random() < profile.bluffRate;

  if (toCall === 0) {
    const wantsBet = bluff || effStrength > 0.55 - profile.aggression * 0.3;
    if (wantsBet && canRaise && Math.random() < profile.aggression + (bluff ? 0.3 : 0)) {
      return sizedRaise(minRaiseTo, maxRaiseTo, profile);
    }
    return { action: 'CHECK' };
  }

  const foldLine = profile.tightness - profile.loose * 0.5;
  if (!bluff && effStrength < foldLine && Math.random() > profile.loose) {
    return { action: 'FOLD' };
  }

  const wantsRaise = canRaise && (bluff || effStrength > 0.72) && Math.random() < profile.aggression;
  if (wantsRaise) return sizedRaise(minRaiseTo, maxRaiseTo, profile);
  return { action: 'CALL' };
}

/** 陪玩机器人"思考时间"：小决定快、大决定（跟大注）偶尔多犹豫一会，避免机械的固定延迟。 */
export function decisionDelayMs(toCall: number, chips: number): number {
  const base = 500 + Math.random() * 1000;
  const isToughSpot = chips > 0 && toCall / chips > 0.2;
  const tank = isToughSpot ? Math.random() * 1400 : 0;
  return Math.round(base + tank);
}
