<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { userStore } from '../stores/userStore'
import PlatformTabBar from '../components/PlatformTabBar.vue'

const router = useRouter()

const playerName = computed(() => userStore.user.value?.name ?? '玩家')
const balance = computed(() => userStore.balance.value?.toLocaleString() ?? '—')

// 动态广告轮播
const currentAdIndex = ref(0)
let adInterval: number | null = null

const advertisements = [
  {
    id: 1,
    title: '新用户专享',
    subtitle: '首充送 100% 奖励金',
    description: '最高可获得 ¥8,888 欢迎礼包',
    badge: '限时优惠',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
  },
  {
    id: 2,
    title: '公平竞技',
    subtitle: '可验证的随机洗牌',
    description: '每一手牌都可追溯、可验证',
    badge: '技术保障',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
  },
  {
    id: 3,
    title: '私密对局',
    subtitle: '创建专属牌桌',
    description: '邀请好友，畅享私密游戏空间',
    badge: '热门功能',
    gradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)'
  }
]

function nextAd(): void {
  currentAdIndex.value = (currentAdIndex.value + 1) % advertisements.length
}

function startAdRotation(): void {
  adInterval = window.setInterval(nextAd, 4000)
}

function stopAdRotation(): void {
  if (adInterval) {
    clearInterval(adInterval)
    adInterval = null
  }
}

onMounted(() => {
  startAdRotation()
})

onUnmounted(() => {
  stopAdRotation()
})

function goBack(): void {
  void router.back()
}
</script>

<template>
  <main class="ui-page home-page">
    <div class="hub-noise" aria-hidden="true" />
    <div class="hub-bg" aria-hidden="true" />
    <header class="hub-header">
      <button class="back-btn" type="button" @click="goBack" aria-label="返回上一页">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
      </button>
      <RouterLink class="brand" :to="{ name: 'app-home' }">CARDROOM</RouterLink>
      <div class="player-summary" aria-label="当前玩家">
        <span>{{ playerName }}</span>
        <strong>{{ balance }}</strong>
      </div>
    </header>

    <!-- 动态广告轮播区 -->
    <section class="ad-carousel" aria-label="平台活动">
      <div class="ad-carousel__inner">
        <transition name="ad-fade" mode="out-in">
          <div
            v-if="currentAdIndex === 0"
            key="ad-1"
            class="ad-carousel__slide"
            :style="{ background: advertisements[0].gradient }"
          >
            <div class="ad-carousel__content">
              <span class="ad-carousel__badge">{{ advertisements[0].badge }}</span>
              <h3 class="ad-carousel__title">{{ advertisements[0].title }}</h3>
              <p class="ad-carousel__subtitle">{{ advertisements[0].subtitle }}</p>
              <p class="ad-carousel__description">{{ advertisements[0].description }}</p>
            </div>
          </div>
          <div
            v-else-if="currentAdIndex === 1"
            key="ad-2"
            class="ad-carousel__slide"
            :style="{ background: advertisements[1].gradient }"
          >
            <div class="ad-carousel__content">
              <span class="ad-carousel__badge">{{ advertisements[1].badge }}</span>
              <h3 class="ad-carousel__title">{{ advertisements[1].title }}</h3>
              <p class="ad-carousel__subtitle">{{ advertisements[1].subtitle }}</p>
              <p class="ad-carousel__description">{{ advertisements[1].description }}</p>
            </div>
          </div>
          <div
            v-else-if="currentAdIndex === 2"
            key="ad-3"
            class="ad-carousel__slide"
            :style="{ background: advertisements[2].gradient }"
          >
            <div class="ad-carousel__content">
              <span class="ad-carousel__badge">{{ advertisements[2].badge }}</span>
              <h3 class="ad-carousel__title">{{ advertisements[2].title }}</h3>
              <p class="ad-carousel__subtitle">{{ advertisements[2].subtitle }}</p>
              <p class="ad-carousel__description">{{ advertisements[2].description }}</p>
            </div>
          </div>
        </transition>
      </div>
      <div class="ad-carousel__indicators">
        <button
          v-for="(ad, index) in advertisements"
          :key="ad.id"
          type="button"
          class="ad-carousel__indicator"
          :class="{ 'ad-carousel__indicator--active': currentAdIndex === index }"
          :aria-label="`切换到广告 ${index + 1}`"
          @click="currentAdIndex = index"
        />
      </div>
    </section>

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

    <!-- 平台优势展示区 -->
    <section class="advantages-section" aria-labelledby="advantages-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">WHY CHOOSE US</p>
          <h2 id="advantages-title">平台优势</h2>
        </div>
      </div>
      <div class="advantages-grid">
        <div class="advantage-card">
          <div class="advantage-card__icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
          <h3 class="advantage-card__title">安全可靠</h3>
          <p class="advantage-card__description">企业级加密技术，保护您的账户和资金安全</p>
        </div>

        <div class="advantage-card">
          <div class="advantage-card__icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h3 class="advantage-card__title">即时游戏</h3>
          <p class="advantage-card__description">毫秒级响应速度，流畅的游戏体验无延迟</p>
        </div>

        <div class="advantage-card">
          <div class="advantage-card__icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 class="advantage-card__title">公平竞技</h3>
          <p class="advantage-card__description">三权分立架构，确保游戏规则公正透明</p>
        </div>

        <div class="advantage-card">
          <div class="advantage-card__icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h3 class="advantage-card__title">隐私保护</h3>
          <p class="advantage-card__description">私密牌桌功能，仅邀请玩家可加入</p>
        </div>
      </div>
    </section>

    <!-- 公平性说明区 -->
    <section class="fairness-section" aria-labelledby="fairness-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">FAIRNESS GUARANTEED</p>
          <h2 id="fairness-title">公平性保障</h2>
        </div>
      </div>
      <div class="fairness-content">
        <div class="fairness-card">
          <div class="fairness-card__number">01</div>
          <h3 class="fairness-card__title">可验证洗牌</h3>
          <p class="fairness-card__text">
            采用密码学安全的随机数生成器，每局洗牌结果都可追溯验证。 Merkle 树结构确保洗牌过程不可篡改。
          </p>
        </div>

        <div class="fairness-card">
          <div class="fairness-card__number">02</div>
          <h3 class="fairness-card__title">三权分立架构</h3>
          <p class="fairness-card__text">
            规则引擎、牌局管理、用户服务相互独立。任何单一组件无法操控游戏结果，从架构层面杜绝作弊。
          </p>
        </div>

        <div class="fairness-card">
          <div class="fairness-card__number">03</div>
          <h3 class="fairness-card__title">公开审计</h3>
          <p class="fairness-card__text">
            所有牌局记录永久保存，支持第三方审计。我们欢迎任何人验证平台的公平性和透明度。
          </p>
        </div>

        <div class="fairness-card">
          <div class="fairness-card__number">04</div>
          <h3 class="fairness-card__title">实时监控</h3>
          <p class="fairness-card__text">
            7x24 小时系统监控，异常行为自动检测。发现任何可疑活动立即冻结并调查。
          </p>
        </div>
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

      <div class="games-grid">
        <RouterLink class="holdem-card" :to="{ name: 'app-lobby' }">
          <div class="holdem-card__index">01</div>
          <div class="holdem-card__copy">
            <p>热门推荐</p>
            <strong>德州扑克</strong>
            <span>标准 6 人桌 · 盲注 5 / 10</span>
          </div>
          <div class="holdem-card__seats">
            <span>开放中</span>
            <b>进入大厅 →</b>
          </div>
        </RouterLink>

        <div class="holdem-card holdem-card--disabled">
          <div class="holdem-card__index">02</div>
          <div class="holdem-card__copy">
            <p>即将上线</p>
            <strong>奥马哈</strong>
            <span>4 张底牌 · 高牌型更刺激</span>
          </div>
          <div class="holdem-card__seats">
            <span>敬请期待</span>
            <b>开发中</b>
          </div>
        </div>

        <div class="holdem-card holdem-card--disabled">
          <div class="holdem-card__index">03</div>
          <div class="holdem-card__copy">
            <p>即将上线</p>
            <strong>梭哈</strong>
            <span>5 张明牌 · 经典对决</span>
          </div>
          <div class="holdem-card__seats">
            <span>敬请期待</span>
            <b>开发中</b>
          </div>
        </div>

        <div class="holdem-card holdem-card--disabled">
          <div class="holdem-card__index">04</div>
          <div class="holdem-card__copy">
            <p>周末限定</p>
            <strong>锦标赛</strong>
            <span>多桌晋级 · 奖池公示</span>
          </div>
          <div class="holdem-card__seats">
            <span>本周六 20:00</span>
            <b>报名开启</b>
          </div>
        </div>
      </div>
    </section>

    <section class="flow-section" aria-label="入局流程">
      <div><span>01</span><strong>选择游戏</strong><p>从可用玩法进入房间列表。</p></div>
      <div><span>02</span><strong>选择房间</strong><p>查看盲注与当前玩家数量。</p></div>
      <div><span>03</span><strong>确认坐下</strong><p>确认后才建立牌桌连接。</p></div>
    </section>

    <PlatformTabBar />
  </main>
</template>

<style scoped>
.home-page { position: relative; isolation: isolate; overflow: hidden; padding: 20px 24px 80px; }
.back-btn { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-raised); color: var(--color-text-muted); cursor: pointer; transition: border-color 180ms ease, color 180ms ease; }
.back-btn:hover { border-color: var(--color-border-strong); color: var(--color-text); }
.hub-noise { position: absolute; z-index: -1; inset: 0; opacity: .45; background-image: linear-gradient(90deg, color-mix(in srgb, var(--color-text) 3%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--color-text) 3%, transparent) 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse at center, black, transparent 74%); }
.hub-bg { position: absolute; inset: 0; z-index: -2; background-image: url('/hero-bg.jpg'); background-size: cover; background-position: center; }
.hub-bg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.62), rgba(0,0,0,0.78)); }
[data-theme="platinum"] .hub-bg { background: linear-gradient(135deg, #e0e7ff 0%, #f0f4ff 50%, #e8f0fe 100%); }
[data-theme="platinum"] .hub-bg::after { background: linear-gradient(to bottom, rgba(255,255,255,.35), rgba(255,255,255,.55)); }
.hub-header, .hero, .game-section, .flow-section, .ad-carousel, .advantages-section, .fairness-section { width: min(100%, 1120px); margin-inline: auto; }
.hub-header { display: flex; align-items: center; justify-content: space-between; min-height: 56px; }
.brand { color: var(--color-text); font-family: var(--font-display); font-size: 14px; font-weight: 700; letter-spacing: .16em; text-decoration: none; }
.player-summary { display: flex; align-items: baseline; gap: 12px; color: var(--color-text-muted); font-size: 12px; }
.player-summary strong { color: var(--color-text); font-family: var(--font-mono); font-size: 14px; }

/* 动态广告轮播 */
.ad-carousel { position: relative; margin-top: 24px; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-float); }
.ad-carousel__inner { position: relative; width: 100%; height: 180px; }
.ad-carousel__slide { position: absolute; inset: 0; display: flex; align-items: center; padding: 32px 40px; color: var(--color-text); }
.ad-carousel__content { position: relative; z-index: 1; max-width: 600px; }
.ad-carousel__badge { display: inline-block; padding: 6px 14px; background: color-mix(in srgb, var(--color-surface) 80%, transparent); backdrop-filter: blur(8px); border-radius: var(--radius-pill); font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: .08em; margin-bottom: 12px; }
.ad-carousel__title { margin: 0; font-family: var(--font-display); font-size: 32px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
.ad-carousel__subtitle { margin: 8px 0 0; font-size: 18px; font-weight: 600; opacity: .95; }
.ad-carousel__description { margin: 6px 0 0; font-size: 14px; opacity: .85; line-height: 1.5; }
.ad-carousel__indicators { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
.ad-carousel__indicator { width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.4); border: 0; cursor: pointer; transition: all 280ms ease; padding: 0; }
.ad-carousel__indicator--active { width: 24px; border-radius: 4px; background: #ffffff; }
.ad-fade-enter-active, .ad-fade-leave-active { transition: opacity 500ms ease; }
.ad-fade-enter-from, .ad-fade-leave-to { opacity: 0; }

/* 平台优势 */
.advantages-section { margin-top: 56px; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 32px; margin-bottom: 28px; }
.section-heading > p { max-width: 300px; margin: 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.55; text-align: right; }
.eyebrow { margin: 0; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: .16em; }
h1, h2 { margin: 16px 0 0; font-family: var(--font-display); letter-spacing: -.04em; }
h1 { max-width: 640px; font-size: clamp(42px, 7vw, 80px); line-height: .98; }
h2 { font-size: 30px; line-height: 1.08; }
.advantages-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
.advantage-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px; background: linear-gradient(110deg, var(--color-surface), var(--color-surface-raised)); box-shadow: var(--shadow-panel); transition: transform 220ms cubic-bezier(.22, 1, .36, 1), border-color 220ms ease; }
.advantage-card:hover { border-color: var(--color-border-strong); transform: translateY(-4px); }
.advantage-card__icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: var(--radius-md); background: linear-gradient(135deg, var(--color-amber), var(--color-amber-dark)); color: var(--color-canvas); margin-bottom: 16px; }
.advantage-card__title { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 700; }
.advantage-card__description { margin: 8px 0 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.6; }

/* 公平性说明 */
.fairness-section { margin-top: 56px; }
.fairness-content { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
.fairness-card { position: relative; border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px; background: var(--color-surface-raised); box-shadow: var(--shadow-panel); transition: transform 220ms cubic-bezier(.22, 1, .36, 1), border-color 220ms ease; }
.fairness-card:hover { border-color: var(--color-border-strong); transform: translateY(-4px); }
.fairness-card__number { position: absolute; top: 20px; right: 24px; font-family: var(--font-mono); font-size: 48px; font-weight: 700; color: color-mix(in srgb, var(--color-text-muted) 15%, transparent); line-height: 1; }
.fairness-card__title { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 700; }
.fairness-card__text { margin: 12px 0 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.65; }

.hero { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr); align-items: center; gap: 48px; min-height: 480px; padding: 56px 0; }
.hero-intro { max-width: 510px; margin: 24px 0 0; color: var(--color-text-muted); font-size: 16px; line-height: 1.65; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 28px; }
.hero-meta span { border: 1px solid var(--color-border); border-radius: var(--radius-pill); padding: 8px 10px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 11px; }
.hero-tableau { position: relative; min-height: 332px; border: 1px solid var(--color-border); border-radius: 48% 48% var(--radius-lg) var(--radius-lg); background: radial-gradient(ellipse at 50% 48%, color-mix(in srgb, var(--color-text-muted) 7%, var(--color-surface-raised)), var(--color-surface) 68%); box-shadow: var(--shadow-float); transform: perspective(1000px) rotateX(8deg) rotateZ(-4deg); }
.tableau-ring { position: absolute; inset: 13%; border: 1px solid color-mix(in srgb, var(--color-text-muted) 40%, transparent); border-radius: 50%; }
.tableau-card { position: absolute; display: grid; place-items: center; width: 74px; height: 108px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-raised) 100%); box-shadow: var(--shadow-panel); color: var(--color-text); font-family: var(--font-display); font-size: 28px; font-weight: 700; line-height: .8; }
.tableau-card span { font-size: 20px; }
.tableau-card--one { left: 20%; top: 30%; transform: rotate(-17deg); }
.tableau-card--two { left: 42%; top: 21%; transform: rotate(2deg); }
.tableau-card--three { right: 17%; top: 29%; transform: rotate(18deg); }
.tableau-pot { position: absolute; left: 50%; bottom: 17%; transform: translateX(-50%); color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; letter-spacing: .13em; text-align: center; }
.tableau-pot strong { color: var(--color-text); font-size: 18px; letter-spacing: 0; }
.tableau-aura { position: absolute; inset: 18%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--color-text-muted) 12%, transparent) 0%, transparent 70%); animation: aura-pulse 4.2s ease-in-out infinite; pointer-events: none; }
@keyframes aura-pulse { 0%, 100% { transform: scale(.92); opacity: .35; } 50% { transform: scale(1.08); opacity: .65; } }
@keyframes float { 0%, 100% { transform: translateY(0) rotate(var(--rotate, 0deg)); } 50% { transform: translateY(-6px) rotate(var(--rotate, 0deg)); } }
.tableau-card { animation: float 5.8s ease-in-out infinite; }
.tableau-card--two { animation-delay: .9s; }
.tableau-card--three { animation-delay: 1.8s; }
.game-section { margin-top: 20px; }
.games-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.holdem-card--disabled { opacity: .85; }
.holdem-card { display: grid; grid-template-columns: 88px 1fr auto; gap: 24px; align-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px; background: linear-gradient(110deg, var(--color-surface), var(--color-surface-raised)); box-shadow: var(--shadow-panel); color: var(--color-text); text-decoration: none; transition: transform 220ms cubic-bezier(.22, 1, .36, 1), border-color 220ms ease, box-shadow 220ms ease; }
.holdem-card:hover { border-color: var(--color-border-strong); transform: translateY(-4px); box-shadow: 0 0 30px rgba(251, 191, 36, .12); }
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
@media (max-width: 768px) { .hero { grid-template-columns: 1fr; gap: 28px; min-height: auto; padding: 48px 0; } .hero-tableau { min-height: 270px; max-width: 540px; width: 100%; margin-inline: auto; } .ad-carousel__inner { height: 160px; } .ad-carousel__slide { padding: 24px; } .ad-carousel__title { font-size: 24px; } }
@media (max-width: 480px) { .home-page { padding-inline: 16px; } .hub-header { min-height: 44px; } .hero { padding-top: 36px; } .section-heading, .holdem-card { display: grid; grid-template-columns: 1fr; } .section-heading > p { text-align: left; } .holdem-card__seats { justify-items: start; } .flow-section { grid-template-columns: 1fr; gap: 24px; } .ad-carousel__inner { height: 140px; } .ad-carousel__title { font-size: 20px; } .ad-carousel__subtitle { font-size: 15px; } }
</style>