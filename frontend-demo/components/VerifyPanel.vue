<script setup lang="ts">
import type { VerifyResult } from '../utils/verify';
defineProps<{
  commitment?: { hash: string; salt: string; clientSeeds: string[] };
  myClientSeed: string;
  reveal?: any;
  verify: VerifyResult | null;
  verifying: boolean;
}>();
</script>
<template>
  <section class="panel" :class="{
    sealed: commitment && !reveal,
    pass: verify && verify.commitmentOk && verify.cardsMatched === verify.cardsChecked,
    fail: verify && (!verify.commitmentOk || verify.cardsMatched !== verify.cardsChecked),
  }">
    <header>
      <span class="eyebrow">公平性审计</span>
      <span class="state">
        <template v-if="!commitment">待开局</template>
        <template v-else-if="!reveal">🔒 承诺已封存</template>
        <template v-else-if="verifying">本地重放中…</template>
        <template v-else-if="verify">{{ verify.commitmentOk && verify.cardsMatched === verify.cardsChecked ? '✔ 验证通过' : '✘ 验证失败' }}</template>
      </span>
    </header>

    <dl v-if="commitment">
      <dt>承诺 SHA-256</dt><dd>{{ commitment.hash }}</dd>
      <dt>我的客户端熵（已混入洗牌）</dt><dd>{{ myClientSeed }}</dd>
      <template v-if="reveal">
        <dt>揭示的服务端种子</dt><dd>{{ reveal.serverSeed }}</dd>
        <dt>Merkle Root（本手事件）</dt><dd>{{ reveal.merkleRoot }}</dd>
      </template>
    </dl>

    <p v-if="verify" class="detail">
      承诺校验 {{ verify.commitmentOk ? '匹配' : '不匹配' }} ·
      已知牌重放比对 {{ verify.cardsMatched }}/{{ verify.cardsChecked }} ·
      验证在你的浏览器本地完成，未信任服务端任何断言
    </p>
    <p v-else-if="commitment && !reveal" class="detail">
      服务端已在发牌前锁定种子承诺。摊牌后将自动在本地重跑洗牌算法比对。
    </p>
  </section>
</template>
<style scoped>
.panel {
  border: 1px solid rgba(127,209,192,.3); border-radius: 12px;
  padding: 14px 16px; background: rgba(13,27,20,.7);
  transition: border-color .3s, box-shadow .3s;
}
.panel.sealed { border-color: var(--seal); }
.panel.pass { border-color: var(--seal); box-shadow: 0 0 0 1px var(--seal), 0 0 22px var(--seal-dim); }
.panel.fail { border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger); }
header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.eyebrow { font-size: .72em; letter-spacing: .18em; color: var(--muted); text-transform: uppercase; }
.state { font-family: var(--mono); font-size: .9em; color: var(--seal); }
.panel.fail .state { color: var(--danger); }
dl { display: grid; gap: 2px 0; margin: 0; }
dt { font-size: .72em; color: var(--muted); margin-top: 8px; }
dd { font-family: var(--mono); font-size: .74em; word-break: break-all; color: var(--ivory); margin: 0; }
.detail { margin-top: 10px; font-size: .78em; color: var(--muted); line-height: 1.5; }
</style>
