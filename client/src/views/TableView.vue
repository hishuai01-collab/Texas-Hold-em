<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import BettingPanel from "../components/BettingPanel.vue";
import PlatformTabBar from "../components/PlatformTabBar.vue";
import PokerTable from "../components/PokerTable.vue";
import WinCelebration from "../components/WinCelebration.vue";
import { pokerStore } from "../stores/pokerStore";
import { soundStore } from "../lib/sound";
import { toastStore } from "../stores/toastStore";

const route = useRoute();
const nameInput = ref(pokerStore.playerName.value);
const connected = computed(
  () => pokerStore.connectionStatus.value === "CONNECTED",
);
const activePlayerId = computed(
  () => pokerStore.state.actionRequest?.playerId ?? null,
);
const tableId = computed(() => {
  const raw = route.params.id;
  return typeof raw === "string" && raw.length > 0 ? raw : "default";
});
const isSpectator = computed(
  () => pokerStore.playerId.value === null && connected.value,
);
const showConnectPanel = computed(
  () => !connected.value || pokerStore.playerId.value === null,
);
const celebrationVisible = ref(false);
const celebrationAmount = computed(() => {
  const id = pokerStore.playerId.value;
  return id
    ? pokerStore.showdownWinnings.value[id]?.toLocaleString()
    : undefined;
});

function connect(): void {
  pokerStore.connect(nameInput.value, tableId.value);
}

watch(
  () => pokerStore.state.error,
  (error) => {
    if (error)
      toastStore.push(
        `连接出现问题，请重试。追踪号：${pokerStore.errorCode.value}`,
        "error",
      );
  },
);

watch(pokerStore.showdownVersion, (version) => {
  if (version > 0 && Number(celebrationAmount.value) > 0)
    celebrationVisible.value = true;
});

watch(tableId, (next, previous) => {
  if (next === previous) return;
  pokerStore.disconnect();
  connect();
});

watch(
  () => pokerStore.connectionStatus.value,
  (status) => {
    if (status === "CONNECTED") {
      soundStore.fadeAmbience(soundStore.bgmVolume.value, 1200)
    }
  },
);

onMounted(connect);
onUnmounted(() => {
  soundStore.fadeAmbience(0, 600)
  setTimeout(() => soundStore.stopAmbience(), 700)
  pokerStore.disconnect();
});
</script>

<template>
  <main class="ui-page px-3 py-4 sm:px-6 sm:py-6">
    <div class="mx-auto max-w-6xl">
      <header
        class="mb-4 flex flex-col gap-3 border-b border-amber-300/20 pb-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <RouterLink class="back-btn" :to="{ name: 'room-list' }">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>返回房间</span>
          </RouterLink>
          <p class="mt-3 text-xs font-bold tracking-[.28em] text-amber-200/90">
            TABLE / {{ tableId }}
          </p>
          <h1 class="mt-1 text-xl font-black tracking-wide text-gray-100">
            德州扑克
          </h1>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span
            class="rounded-full border border-amber-400/35 px-3 py-1 font-bold shadow-[0_0_12px_rgba(251,191,36,.15)]"
            :class="
              connected
                ? 'bg-amber-950/70 text-amber-300'
                : 'bg-rose-950/70 text-rose-300'
            "
          >
            {{ connected ? "已连接" : "连接中" }}
            <span v-if="pokerStore.reconnectAttempt.value > 0">
              ({{ pokerStore.reconnectAttempt.value }})</span
            >
          </span>
          <span
            class="rounded-full border border-gray-600/40 bg-gray-900/80 px-3 py-1 text-gray-300"
            >事件 #{{ pokerStore.lastSeq }}</span
          >
          <span
            v-if="pokerStore.playerId"
            class="rounded-full border border-amber-400/30 bg-amber-950/50 px-3 py-1 text-amber-200"
            >已入座</span
          >
          <span
            v-else-if="connected"
            class="rounded-full border border-gray-600/40 bg-gray-900/80 px-3 py-1 text-gray-400"
            >旁观</span
          >
        </div>
      </header>

      <p class="narrow-screen-note">已切换为紧凑牌桌视图</p>
      <div class="table-layout grid gap-4 lg:grid-cols-[1fr_280px]">
        <!-- ── 牌桌区域 ── -->
        <div class="table-scroll relative min-w-[320px] overflow-x-auto">
          <PokerTable
            :seats="pokerStore.state.seats"
            :board="pokerStore.state.board"
            :pot="pokerStore.state.pot"
            :street="pokerStore.state.street"
            :player-id="pokerStore.playerId.value"
            :acting-player-id="activePlayerId"
            :action-version="pokerStore.actionVersion.value"
            :hole-cards="pokerStore.state.holeCards"
            :revealed-cards="pokerStore.state.revealedCards"
          />

          <!-- ── 重连覆盖层（保留原始逻辑） ── -->
          <div
            v-if="
              pokerStore.frozen.value ||
              pokerStore.connectionStatus.value === 'RECONNECTING'
            "
            class="absolute inset-0 z-50 flex select-none flex-col items-center justify-center rounded-[3rem] bg-gray-950/90 backdrop-blur-sm"
          >
            <div
              class="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-gray-300"
            />
            <p class="mt-4 text-lg font-bold text-gray-300">正在重新连接…</p>
            <p
              v-if="pokerStore.reconnectAttempt.value > 0"
              class="mt-1 text-sm text-gray-500"
            >
              第 {{ pokerStore.reconnectAttempt.value }} 次重连尝试
            </p>
            <p class="mt-1 text-xs text-gray-600">请勿刷新页面</p>
          </div>
        </div>

        <!-- ── 侧栏 ── -->
        <aside class="space-y-4">
          <!-- 连接面板：仅未入座时显示 -->
          <section v-if="showConnectPanel" class="ui-panel p-4">
            <label
              class="text-xs font-bold uppercase tracking-wider text-gray-400"
              for="name"
              >玩家昵称</label
            >
            <div class="mt-2 flex gap-2">
              <input
                id="name"
                v-model="nameInput"
                :disabled="Boolean(pokerStore.playerId) && connected"
                class="ui-input min-w-0 flex-1 px-3 py-2 text-sm disabled:opacity-60"
                maxlength="24"
              />
              <button
                class="ui-button ui-button--primary"
                :disabled="connected && Boolean(pokerStore.playerId)"
                @click="connect"
              >
                {{ connected && isSpectator ? "加入" : "连接" }}
              </button>
            </div>
            <p
              v-if="isSpectator"
              class="mt-2 text-center text-xs text-gray-500"
            >
              旁观模式 · 输入昵称后点击“加入”入座
            </p>
          </section>

          <!-- 已入座：始终显示开始/离开 -->
          <section v-if="!showConnectPanel" class="ui-panel space-y-2 p-4">
            <div class="flex items-center justify-between text-xs">
              <span class="font-mono text-gray-400">玩家</span>
              <span class="font-mono text-gray-300">{{
                pokerStore.playerName
              }}</span>
            </div>
            <button
              class="ui-button ui-button--primary w-full"
              :disabled="
                !connected ||
                pokerStore.state.seats.length < 2 ||
                !pokerStore.playerId
              "
              @click="pokerStore.start"
            >
              开始下一局
            </button>
            <button
              class="ui-button ui-button--neutral w-full"
              @click="pokerStore.disconnect"
            >
              离开牌桌
            </button>
          </section>

          <BettingPanel
            :connected="connected && !pokerStore.frozen.value"
            :request="
              pokerStore.isMyTurn ? pokerStore.state.actionRequest : null
            "
            :seat="pokerStore.mySeat.value"
            @action="pokerStore.action"
          />

          <section class="ui-panel p-4 text-xs">
            <p class="font-bold tracking-wider text-gray-400">原始事件流</p>
            <ol class="mt-2 space-y-1 font-mono text-gray-500">
              <li v-for="event in pokerStore.state.eventLog" :key="event">
                {{ event }}
              </li>
              <li
                v-if="pokerStore.state.eventLog.length === 0"
                class="text-gray-600"
              >
                等待服务端事件
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
    <WinCelebration
      :show="celebrationVisible"
      title="赢得底池"
      :amount="celebrationAmount"
      @complete="celebrationVisible = false"
    />
    <PlatformTabBar />
  </main>
</template>

<style scoped>
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
  text-decoration: none;
}
.back-btn:hover {
  color: var(--color-text);
}
.back-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
