<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { userStore } from "../stores/userStore";
import { profileStore } from "../stores/profileStore";
import { vipStore } from "../stores/vipStore";
import { toastStore } from "../stores/toastStore";
import PlatformTabBar from "../components/PlatformTabBar.vue";

const router = useRouter();

const playerName = computed(() => userStore.user.value?.name ?? "玩家");
const balance = computed(
  () =>
    userStore.balance.value?.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) ?? "—",
);

const vipLevel = computed(() => vipStore.level.value);
const vipColor = computed(() => vipLevel.value.color);
const vipName = computed(() => vipLevel.value.name);
const vipBadge = computed(() => vipLevel.value.badge);

const progressPercent = computed(() =>
  Math.round(vipStore.progress.value * 100),
);
const nextLevelName = computed(() => vipStore.next.value?.name ?? "最高等级");
const handsInCurrent = computed(() => vipStore.handsInCurrent.value);

const handsPlayedLabel = computed(
  () => profileStore.formatted.value.handsPlayed,
);
const handsWonLabel = computed(() => profileStore.formatted.value.handsWon);
const winRateLabel = computed(() => profileStore.formatted.value.winRate);
const biggestWinLabel = computed(() => profileStore.formatted.value.biggestWin);
const totalWinningsLabel = computed(
  () => profileStore.formatted.value.totalWinnings,
);
const currentStreakLabel = computed(
  () => profileStore.formatted.value.currentStreak,
);
const totalWinningsNumber = computed(
  () => profileStore.stats.value.totalWinnings,
);

function goSettings(): void {
  void router.push({ name: "app-settings" });
}

function goBack(): void {
  void router.back();
}

function goLobby(): void {
  void router.push({ name: "app-lobby" });
}

function logout(): void {
  userStore.clear();
  void router.push({ name: "app-login" });
}

function inviteFriend(): void {
  const inviteUrl = `${window.location.origin}/t/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  navigator.clipboard
    .writeText(inviteUrl)
    .then(() => {
      toastStore.push("邀请链接已复制到剪贴板，发给好友即可加入。", "success");
    })
    .catch(() => {
      toastStore.push("邀请链接生成失败，请稍后再试。", "error");
    });
}

function goDeposit(): void {
  void router.push({ name: "app-promo" });
}

function showActionComingSoon(label: string): void {
  toastStore.push(`${label} 功能正在接入中，敬请期待。`, "info");
}

function handleGroupAction(group: string, label: string): void {
  if (group === "数据") {
    if (label === "清除缓存") {
      localStorage.clear();
      toastStore.push("缓存已清除，页面即将刷新。", "success");
      setTimeout(() => window.location.reload(), 800);
      return;
    }
    if (label === "导出数据") {
      const exportData: Record<string, unknown> = {
        profile: profileStore.stats.value,
        vipLevel: vipStore.level.value,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `poker-profile-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastStore.push("数据已导出。", "success");
      return;
    }
  }
  if (group === "账号安全") {
    if (label === "修改密码") {
      toastStore.push("密码修改功能需要后端支持，请联系客服处理。", "info");
      return;
    }
    if (label === "绑定手机") {
      toastStore.push("手机绑定功能需要后端支持，请联系客服处理。", "info");
      return;
    }
    if (label === "登录设备") {
      toastStore.push(
        "当前设备：" + navigator.userAgent.slice(0, 60) + "...",
        "info",
      );
      return;
    }
  }
  if (group === "隐私") {
    if (label === "游戏记录") {
      toastStore.push(
        `已玩 ${profileStore.stats.value.handsPlayed} 局，胜率 ${winRateLabel.value}`,
        "info",
      );
      return;
    }
  }
  if (group === "关于") {
    if (label === "帮助中心") {
      toastStore.push("帮助中心正在建设中，常见问题请查看用户协议。", "info");
      return;
    }
    if (label === "用户协议") {
      toastStore.push("用户协议页面正在建设中。", "info");
      return;
    }
  }
  showActionComingSoon(label);
}
</script>

<template>
  <main class="ui-page profile-page">
    <header class="profile-header">
      <button
        class="back-btn"
        type="button"
        @click="goBack"
        aria-label="返回上一页"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>
      <div class="profile-summary">
        <h1>{{ playerName }}</h1>
        <p class="balance">{{ balance }}</p>
      </div>
    </header>

    <button
      class="settings-fab"
      type="button"
      @click="goSettings"
      aria-label="设置"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H1a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V1a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 .33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
    </button>

    <section class="vip-card" aria-label="VIP 等级">
      <div class="vip-level-row">
        <div
          class="vip-badge"
          :style="{ color: vipColor, borderColor: vipColor }"
        >
          <span class="vip-badge__icon" aria-hidden="true">{{ vipBadge }}</span>
          <span class="vip-badge__name">{{ vipName }}</span>
        </div>
        <div class="vip-next">
          <span class="vip-next__label">下一等级：{{ nextLevelName }}</span>
        </div>
      </div>
      <div class="vip-progress" aria-label="VIP 经验进度">
        <div class="vip-progress__track">
          <div
            class="vip-progress__fill"
            :style="{ width: `${progressPercent}%`, backgroundColor: vipColor }"
          />
        </div>
        <span class="vip-progress__label"
          >{{ handsInCurrent }} /
          {{
            vipStore.next.value
              ? vipStore.next.value.minHands - vipStore.level.value.minHands
              : 0
          }}
          局（{{ progressPercent }}%）</span
        >
      </div>
    </section>

    <section class="quick-actions" aria-label="快速操作">
      <button class="action-btn" type="button" @click="inviteFriend">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
          />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        <span>邀请好友</span>
      </button>
      <button class="action-btn" type="button" @click="goDeposit">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 12v5a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 1 0 4" />
        </svg>
        <span>领金币</span>
      </button>
      <button class="action-btn" type="button" @click="goLobby">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
        <span>游戏大厅</span>
      </button>
    </section>

    <section class="stats-grid" aria-label="游戏统计">
      <div class="stat-card">
        <span class="stat-label">总局数</span>
        <span class="stat-value">{{ handsPlayedLabel }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">胜场</span>
        <span class="stat-value">{{ handsWonLabel }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">胜率</span>
        <span class="stat-value">{{ winRateLabel }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">盈亏</span>
        <span
          class="stat-value"
          :class="totalWinningsNumber >= 0 ? 'text-positive' : 'text-negative'"
          >{{ totalWinningsLabel }}</span
        >
      </div>
      <div class="stat-card">
        <span class="stat-label">最高赢取</span>
        <span class="stat-value">{{ biggestWinLabel }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">当前连胜</span>
        <span class="stat-value">{{ currentStreakLabel }}</span>
      </div>
    </section>

    <section class="profile-sections" aria-label="账户分组">
      <div class="settings-section">
        <h2 class="settings-section__title">账号安全</h2>
        <div class="settings-list">
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('账号安全', '修改密码')"
          >
            <div class="setting-info">
              <span class="setting-label">修改密码</span>
              <span class="setting-desc">定期更换密码保护账户</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('账号安全', '绑定手机')"
          >
            <div class="setting-info">
              <span class="setting-label">绑定手机</span>
              <span class="setting-desc">增强账号安全与找回</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('账号安全', '登录设备')"
          >
            <div class="setting-info">
              <span class="setting-label">登录设备</span>
              <span class="setting-desc">查看与管理已登录设备</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-section__title">隐私</h2>
        <div class="settings-list">
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('隐私', '游戏记录')"
          >
            <div class="setting-info">
              <span class="setting-label">游戏记录</span>
              <span class="setting-desc">控制手牌历史可见性</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-section__title">数据</h2>
        <div class="settings-list">
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('数据', '清除缓存')"
          >
            <div class="setting-info">
              <span class="setting-label">清除缓存</span>
              <span class="setting-desc">清理本地数据</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('数据', '导出数据')"
          >
            <div class="setting-info">
              <span class="setting-label">导出数据</span>
              <span class="setting-desc">导出游戏历史记录</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-section__title">关于</h2>
        <div class="settings-list">
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('关于', '帮助中心')"
          >
            <div class="setting-info">
              <span class="setting-label">帮助中心</span>
              <span class="setting-desc">常见问题与客服</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
          <button
            class="setting-row"
            type="button"
            @click="handleGroupAction('关于', '用户协议')"
          >
            <div class="setting-info">
              <span class="setting-label">用户协议</span>
              <span class="setting-desc">查看服务条款与隐私政策</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
          <button class="setting-row" type="button" @click="goSettings">
            <div class="setting-info">
              <span class="setting-label">设置</span>
              <span class="setting-desc">音效、通知、显示等偏好</span>
            </div>
            <span class="menu-item__arrow">&rarr;</span>
          </button>
        </div>
      </div>
    </section>

    <section class="logout-section">
      <button class="logout-btn" type="button" @click="logout">退出登录</button>
    </section>

    <PlatformTabBar />
  </main>
</template>

<style scoped>
.profile-page {
  padding: 24px 24px 80px;
}
.profile-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.back-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    color 180ms ease;
}
.back-btn:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}
.settings-fab {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 80;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}
.settings-fab:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
  transform: rotate(45deg);
}
.profile-summary h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: -0.02em;
}
.balance {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 14px;
}

.vip-card {
  max-width: 600px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    135deg,
    var(--color-surface),
    var(--color-surface-raised)
  );
  box-shadow: var(--shadow-panel);
  margin-bottom: 24px;
}
.vip-level-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.vip-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid;
  background: rgba(0, 0, 0, 0.25);
}
.vip-badge__icon {
  font-size: 18px;
  line-height: 1;
}
.vip-badge__name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.vip-next__label {
  color: var(--color-text-muted);
  font-size: 12px;
}

.vip-progress__track {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  overflow: hidden;
}
.vip-progress__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width 240ms ease;
}
.vip-progress__label {
  display: block;
  margin-top: 8px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: 600px;
  margin-bottom: 24px;
}
.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    135deg,
    var(--color-surface),
    var(--color-surface-raised)
  );
  color: var(--color-text);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    transform 180ms ease;
}
.action-btn:hover {
  border-color: var(--color-border-strong);
  transform: translateY(-2px);
}
.action-btn svg {
  color: var(--color-text);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: 600px;
  margin-bottom: 24px;
}
.stat-card {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    135deg,
    var(--color-surface),
    var(--color-surface-raised)
  );
}
.stat-label {
  display: block;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  margin-bottom: 8px;
}
.stat-value {
  display: block;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}
.text-positive {
  color: var(--color-amber);
}
.text-negative {
  color: #f87171;
}

.profile-sections {
  max-width: 600px;
  display: grid;
  gap: 20px;
}
.settings-section {
}
.settings-section__title {
  margin: 0 0 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.settings-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    135deg,
    var(--color-surface),
    var(--color-surface-raised)
  );
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
  background: none;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background 180ms ease;
  width: 100%;
}
.setting-row:last-child {
  border-bottom: 0;
}
.setting-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
.setting-info {
  display: grid;
  gap: 4px;
}
.setting-label {
  font-weight: 600;
  font-size: 15px;
}
.setting-desc {
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.4;
}
.menu-item__arrow {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 12px;
}

.logout-section {
  max-width: 600px;
  margin-top: 32px;
}
.logout-btn {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  color: #f87171;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    color 180ms ease;
}
.logout-btn:hover {
  border-color: #f87171;
  color: #fca5a5;
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .quick-actions {
    grid-template-columns: 1fr;
  }
}
</style>
