<script setup lang="ts">
import { useRouter } from "vue-router";
import PlatformTabBar from "../components/PlatformTabBar.vue";

const router = useRouter();

function goBack(): void {
  void router.back();
}
</script>

<template>
  <main class="ui-page promo-page">
    <header class="promo-header">
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
      <div>
        <h1>优惠大厅</h1>
        <p class="subtitle">专属福利与活动，助你赢在牌桌。</p>
      </div>
    </header>

    <section class="promo-grid" aria-labelledby="promo-title">
      <div class="promo-card promo-card--featured">
        <div class="promo-card__tag">热门</div>
        <h3>首充礼包</h3>
        <p>首次充值即享 100% 额外筹码，最高 10,000。</p>
        <button class="ui-button ui-button--primary">立即领取</button>
      </div>

      <div class="promo-card">
        <div class="promo-card__tag">每日</div>
        <h3>每日签到</h3>
        <p>连续签到 7 天解锁限定桌布与金卡背。</p>
        <button class="ui-button ui-button--neutral">去签到</button>
      </div>

      <div class="promo-card">
        <div class="promo-card__tag">邀请</div>
        <h3>邀请好友</h3>
        <p>邀请好友加入牌局，双方各得 2,000 启动资金。</p>
        <button class="ui-button ui-button--neutral">邀请</button>
      </div>

      <div class="promo-card">
        <div class="promo-card__tag">限定</div>
        <h3>周末锦标赛</h3>
        <p>每周六 20:00 开启，奖金池实时公示。</p>
        <button class="ui-button ui-button--neutral">查看详情</button>
      </div>

      <div class="promo-card">
        <div class="promo-card__tag">返水</div>
        <h3>VIP 返水</h3>
        <p>根据 VIP 等级返水 0.5% ~ 2%，自动发放。</p>
        <button class="ui-button ui-button--neutral">查看等级</button>
      </div>
    </section>

    <PlatformTabBar />
  </main>
</template>

<style scoped>
.promo-page {
  padding: 24px 24px 80px;
}
.promo-header {
  max-width: 800px;
  margin-bottom: 28px;
}
.promo-header h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 32px;
  letter-spacing: -0.02em;
}
.subtitle {
  margin: 8px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
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
  margin-bottom: 12px;
}
.back-btn:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}
.promo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  max-width: 1120px;
}
.promo-card {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  background: linear-gradient(
    135deg,
    var(--color-surface),
    var(--color-surface-raised)
  );
  box-shadow: var(--shadow-panel);
  transition:
    transform 220ms ease,
    border-color 220ms ease;
}
.promo-card:hover {
  border-color: var(--color-border-strong);
  transform: translateY(-2px);
}
.promo-card--featured {
  border-color: color-mix(in srgb, var(--color-amber) 55%, var(--color-border));
}
.promo-card__tag {
  position: absolute;
  top: 12px;
  right: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}
.promo-card h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
}
.promo-card p {
  margin: 8px 0 16px;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}
</style>
