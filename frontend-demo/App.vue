<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGame } from './composables/useGame';
import PlayingCard from './components/PlayingCard.vue';
import SeatPod from './components/SeatPod.vue';
import VerifyPanel from './components/VerifyPanel.vue';

const g = useGame();
const name = ref('帅帅');
const raiseTo = ref(60);

const me = computed(() => g.snap.value?.seats.find(s => s.id === g.playerId.value));
const isMyTurn = computed(() => g.snap.value?.toAct !== null && g.snap.value?.toAct === me.value?.seatIndex);
const toCall = computed(() => (g.snap.value && me.value) ? g.snap.value.currentBet - me.value.roundBet : 0);
const inHand = computed(() => !!g.snap.value && !['showdown', 'complete', ''].includes(g.snap.value.street));
const streetLabel: Record<string, string> = {
  preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌',
  showdown: '摊牌', complete: '结束',
};
</script>

<template>
  <div v-if="!g.connected.value" class="lobby">
    <h1>可验证德州扑克</h1>
    <p class="sub">服务端权威 · 承诺-揭示 · 浏览器本地验证</p>
    <div class="join">
      <input v-model="name" placeholder="昵称" @keyup.enter="g.connect(name)" />
      <button class="primary" @click="g.connect(name)">入座</button>
    </div>
  </div>

  <div v-else class="room">
    <aside class="rail">
      <VerifyPanel
        :commitment="g.snap.value?.commitment"
        :my-client-seed="g.myClientSeed.value"
        :reveal="g.snap.value?.lastResult?.reveal"
        :verify="g.verify.value"
        :verifying="g.verifying.value"
      />
      <section class="log">
        <span class="eyebrow">事件</span>
        <p v-for="(l, i) in g.log.slice(0, 8)" :key="i">{{ l }}</p>
      </section>
    </aside>

    <main class="table-area">
      <div class="table">
        <div class="street" v-if="g.snap.value?.handId">
          {{ streetLabel[g.snap.value.street] }} · 底池
          <b>{{ g.snap.value.pot.toLocaleString() }}</b>
        </div>
        <div class="community">
          <PlayingCard v-for="c in g.snap.value?.community ?? []" :key="c" :card="c" />
          <PlayingCard v-for="i in Math.max(0, 5 - (g.snap.value?.community.length ?? 0))" :key="'b'+i" />
        </div>
        <div class="seats">
          <SeatPod
            v-for="s in g.snap.value?.seats ?? []" :key="s.id"
            :seat="s"
            :is-me="s.id === g.playerId.value"
            :is-turn="g.snap.value?.toAct === s.seatIndex"
            :is-button="g.snap.value?.button === s.seatIndex"
            :won="g.snap.value?.lastResult?.winnings?.[s.id]"
          />
        </div>
      </div>

      <div class="actions">
        <template v-if="!inHand">
          <button class="primary" @click="g.startHand()">开始新一手（生成新客户端熵）</button>
        </template>
        <template v-else>
          <button :disabled="!isMyTurn" @click="g.act('fold')">弃牌</button>
          <button :disabled="!isMyTurn || toCall > 0" @click="g.act('check')">过牌</button>
          <button :disabled="!isMyTurn || toCall <= 0" @click="g.act('call')">
            跟注{{ toCall > 0 ? ` ${toCall}` : '' }}
          </button>
          <span class="raise-group">
            <input type="number" v-model.number="raiseTo" :min="(g.snap.value?.currentBet ?? 0) + 20" step="20" />
            <button :disabled="!isMyTurn" @click="g.act('raise', raiseTo)">加注到</button>
          </span>
        </template>
        <span class="err" v-if="g.errorMsg.value">{{ g.errorMsg.value }}</span>
      </div>
    </main>
  </div>
</template>

<style scoped>
.lobby { text-align: center; padding-top: 18vh; }
.lobby h1 { font-size: 2.2em; letter-spacing: .04em; }
.sub { color: var(--muted); margin: 10px 0 28px; font-family: var(--mono); font-size: .85em; }
.join { display: flex; gap: 10px; justify-content: center; }
input {
  font: inherit; background: rgba(13,27,20,.8); border: 1px solid var(--brass-dim);
  color: var(--ivory); border-radius: 999px; padding: 10px 16px; width: 180px;
}
input:focus-visible { outline: 2px solid var(--seal); outline-offset: 1px; }

.room { display: grid; grid-template-columns: 320px 1fr; gap: 18px; }
@media (max-width: 900px) { .room { grid-template-columns: 1fr; } }
.rail { display: flex; flex-direction: column; gap: 14px; }
.log {
  border: 1px solid rgba(201,162,39,.18); border-radius: 12px;
  padding: 12px 14px; background: rgba(13,27,20,.55);
}
.log p { font-size: .78em; color: var(--muted); margin: 5px 0 0; font-family: var(--mono); line-height: 1.45; }
.eyebrow { font-size: .72em; letter-spacing: .18em; color: var(--muted); text-transform: uppercase; }

.table {
  border: 2px solid rgba(201,162,39,.35); border-radius: 160px;
  padding: 34px 30px 26px; min-height: 380px;
  background: radial-gradient(ellipse at 50% 30%, #245040 0%, var(--felt) 70%);
  box-shadow: inset 0 0 60px rgba(0,0,0,.4);
  display: flex; flex-direction: column; align-items: center; gap: 22px;
}
.street { font-family: var(--mono); color: var(--muted); font-size: .9em; }
.street b { color: var(--brass); font-size: 1.15em; margin-left: 4px; }
.community { display: flex; gap: 8px; }
.seats { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; }

.actions {
  margin-top: 16px; display: flex; gap: 10px; align-items: center;
  flex-wrap: wrap; justify-content: center;
}
.raise-group { display: flex; gap: 6px; align-items: center; }
.raise-group input { width: 90px; border-radius: 10px; padding: 8px 10px; font-family: var(--mono); }
.err { color: var(--danger); font-size: .82em; font-family: var(--mono); }
</style>
