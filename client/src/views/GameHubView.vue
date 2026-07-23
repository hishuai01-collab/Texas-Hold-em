<script setup lang="ts">
import { computed } from 'vue'
import { userStore } from '../stores/userStore'

const playerName = computed(() => userStore.user.value?.name ?? '玩家')
const balance = computed(() => userStore.balance.value?.toLocaleString() ?? '—')
</script>

<template>
  <main class="ui-page game-hub">
    <div class="hub-noise" aria-hidden="true" />
    <div class="hub-bg" aria-hidden="true" />
    <header class="hub-header">
      <RouterLink class="brand" :to="{ name: 'game-hub' }">CARDROOM</RouterLink>
      <div class="player-summary" aria-label="当前玩家">
        <span>{{ playerName }}</span>
        <strong>{{ balance }}</strong>
      </div>
    </header>

    <section class="hero" aria-labelledby="games-title">
      <div class="hero-copy">
        <p class="eyebrow">PRIVATE TABLES · VERIFIED SHUFFLES</p>
        <h1 id="games-title">牌局，从桌前开始。</h1>
        <p class="hero-intro">选择游戏，浏览房间，确认坐下。每一步都清楚，真正入局前不会占用你的座位。</p>
        <div class="hero-meta" aria-label="游戏特性">
          <span>6 人牌桌</span>
          <span>无限注</span>
          <span>可验证洗牌</span>
        </div>
      </div>

      <div class="hero-tableau" aria-hidden="true">
        <span class="tableau-ring" />
        <span class="tableau-card tableau-card--one">A<span>♠</span></span>
        <span class="tableau-card tableau-card--two">K<span>♦</span></span>
        <span class="tableau-card tableau-card--three">Q<span>♣</span></span>
        <span class="tableau-pot">POT<br><strong>10,000</strong></span>
        <span class="tableau-aura" />
      </div>
    </section>

    <section class="game-section" aria-labelledby="holdem-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">AVAILABLE NOW</p>
          <h2 id="holdem-title">选择游戏</h2>
        </div>
        <p>从公开房间开始，或使用邀请链接进入私桌。</p>
      </div>

      <RouterLink class="holdem-card" :to="{ name: 'room-list' }">
        <div class="holdem-card__index">01</div>
        <div class="holdem-card__copy">
          <p>无限注</p>
          <strong>德州扑克</strong>
          <span>标准 6 人桌 · 盲注 5 / 10</span>
        </div>
        <div class="holdem-card__seats">
          <span>公开房间</span>
          <b>选择房间</b>
        </div>
      </RouterLink>
    </section>

    <section class="flow-section" aria-label="入局流程">
      <div><span>01</span><strong>选择游戏</strong><p>从可用玩法进入房间列表。</p></div>
      <div><span>02</span><strong>选择房间</strong><p>查看盲注与当前玩家数量。</p></div>
      <div><span>03</span><strong>确认坐下</strong><p>确认后才建立牌桌连接。</p></div>
    </section>
  </main>
</template>

<style scoped>
.game-hub { position: relative; isolation: isolate; overflow: hidden; padding: 20px 24px 56px; }
.hub-noise { position: absolute; z-index: -1; inset: 0; opacity: .55; background-image: linear-gradient(90deg, color-mix(in srgb, var(--color-text) 3%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--color-text) 3%, transparent) 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse at center, black, transparent 74%); }
.hub-bg { position: absolute; inset: 0; z-index: -2; background-image: url('/hero-bg.jpg'); background-size: cover; background-position: center; }
.hub-bg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.75)); }
.hub-header, .hero, .game-section, .flow-section { width: min(100%, 1120px); margin-inline: auto; }
.hub-header { display: flex; align-items: center; justify-content: space-between; min-height: 56px; }
.brand { color: var(--color-text); font-family: var(--font-display); font-size: 14px; font-weight: 700; letter-spacing: .16em; text-decoration: none; }
.player-summary { display: flex; align-items: baseline; gap: 12px; color: var(--color-text-muted); font-size: 12px; }
.player-summary strong { color: var(--color-text); font-family: var(--font-mono); font-size: 14px; }
.hero { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr); align-items: center; gap: 48px; min-height: 480px; padding: 56px 0; }
.eyebrow { margin: 0; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: .16em; }
h1, h2 { margin: 16px 0 0; font-family: var(--font-display); letter-spacing: -.04em; }
h1 { max-width: 640px; font-size: clamp(42px, 7vw, 80px); line-height: .98; }
h2 { font-size: 30px; line-height: 1.08; }
.hero-intro { max-width: 510px; margin: 24px 0 0; color: var(--color-text-muted); font-size: 16px; line-height: 1.65; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 28px; }
.hero-meta span { border: 1px solid var(--color-border); border-radius: var(--radius-pill); padding: 8px 10px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 11px; }
.hero-tableau { position: relative; min-height: 332px; border: 1px solid var(--color-border); border-radius: 48% 48% var(--radius-lg) var(--radius-lg); background: radial-gradient(ellipse at 50% 48%, color-mix(in srgb, var(--color-text-muted) 8%, var(--color-surface-raised)), var(--color-surface) 68%); box-shadow: var(--shadow-float); transform: perspective(1000px) rotateX(8deg) rotateZ(-4deg); }
.tableau-ring { position: absolute; inset: 13%; border: 1px solid color-mix(in srgb, var(--color-text-muted) 45%, transparent); border-radius: 50%; }
.tableau-card { position: absolute; display: grid; place-items: center; width: 74px; height: 108px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-text); box-shadow: var(--shadow-panel); color: var(--color-canvas); font-family: var(--font-display); font-size: 28px; font-weight: 700; line-height: .8; }
.tableau-card span { font-size: 20px; }
.tableau-card--one { left: 20%; top: 30%; transform: rotate(-17deg); }
.tableau-card--two { left: 42%; top: 21%; transform: rotate(2deg); }
.tableau-card--three { right: 17%; top: 29%; transform: rotate(18deg); }
.tableau-pot { position: absolute; left: 50%; bottom: 17%; transform: translateX(-50%); color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; text-align: center; }
.tableau-pot strong { color: var(--color-text); font-size: 18px; letter-spacing: 0; }
.tableau-aura { position: absolute; inset: 18%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--color-text-muted) 14%, transparent) 0%, transparent 70%); animation: aura-pulse 4.2s ease-in-out infinite; pointer-events: none; }
@keyframes aura-pulse { 0%, 100% { transform: scale(.92); opacity: .4; } 50% { transform: scale(1.08); opacity: .75; } }
@keyframes float { 0%, 100% { transform: translateY(0) rotate(var(--rotate, 0deg)); } 50% { transform: translateY(-6px) rotate(var(--rotate, 0deg)); } }
.tableau-card { animation: float 5.8s ease-in-out infinite; }
.tableau-card--two { animation-delay: .9s; }
.tableau-card--three { animation-delay: 1.8s; }
.game-section { margin-top: 20px; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 32px; margin-bottom: 20px; }
.section-heading > p { max-width: 300px; margin: 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.55; text-align: right; }
.holdem-card { display: grid; grid-template-columns: 88px 1fr auto; gap: 24px; align-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px; background: linear-gradient(110deg, var(--color-surface), var(--color-surface-raised)); box-shadow: var(--shadow-panel); color: var(--color-text); text-decoration: none; transition: transform 220ms cubic-bezier(.22, 1, .36, 1), border-color 220ms ease; }
.holdem-card:hover { border-color: var(--color-border-strong); transform: translateY(-4px); }
.holdem-card__index { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 28px; }
.holdem-card__copy p, .holdem-card__copy span { margin: 0; color: var(--color-text-muted); font-size: 12px; }
.holdem-card__copy strong { display: block; margin: 4px 0 6px; font-family: var(--font-display); font-size: 26px; }
.holdem-card__seats { display: grid; gap: 8px; justify-items: end; color: var(--color-text-muted); font-size: 12px; }
.holdem-card__seats b { color: var(--color-text); font-size: 13px; }
.flow-section { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 48px; }
.flow-section div { border-top: 1px solid var(--color-border); padding-top: 16px; }
.flow-section span { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 11px; }
.flow-section strong { display: block; margin-top: 12px; font-size: 14px; }
.flow-section p { margin: 8px 0 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.5; }
@media (max-width: 768px) { .hero { grid-template-columns: 1fr; gap: 28px; min-height: auto; padding: 48px 0; } .hero-tableau { min-height: 270px; max-width: 540px; width: 100%; margin-inline: auto; } }
@media (max-width: 480px) { .game-hub { padding-inline: 16px; } .hub-header { min-height: 44px; } .hero { padding-top: 36px; } .section-heading, .holdem-card { display: grid; grid-template-columns: 1fr; } .section-heading > p { text-align: left; } .holdem-card__seats { justify-items: start; } .flow-section { grid-template-columns: 1fr; gap: 24px; } }
</style>
