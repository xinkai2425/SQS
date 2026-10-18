<script setup>
import { useRouter } from 'vue-router'
import { ArrowForwardOutline, DocumentTextOutline, HardwareChipOutline, SpeedometerOutline, ExtensionPuzzleOutline } from '@vicons/ionicons5'

const router = useRouter()

const features = [
  { icon: DocumentTextOutline, title: '资料一键入库', desc: '支持 PDF、Word、PPT 和图片，自动拆解章节、知识点与题干。' },
  { icon: SpeedometerOutline, title: '出题过程可控', desc: '按科目、教材、章节、题型和难度生成，结果可以继续校验与编辑。' },
  { icon: HardwareChipOutline, title: '解析同步生成', desc: '答案、解析和分值随题目一起沉淀到题库，减少重复整理。' },
  { icon: ExtensionPuzzleOutline, title: '试卷导出完整', desc: '从题库筛选、智能组卷到试卷导出，覆盖教研常用流程。' }
]

const proofItems = [
  { value: 'PDF / Word / PPT', label: '常见资料格式' },
  { value: '题目 + 答案 + 解析', label: '一次生成' },
  { value: '章节 / 题型 / 难度', label: '可控维度' }
]

</script>

<template>
  <div class="landing-page">
    <header class="header">
      <div class="logo">
        <img src="/Logo.png" alt="Logo" class="logo-img" />
        <span class="logo-text">智能组卷系统</span>
      </div>
      <div class="nav-actions">
        <n-button text class="nav-link" @click="router.push('/login')">登录</n-button>
        <n-button type="primary" round @click="router.push('/login')">免费试用</n-button>
      </div>
    </header>

    <main>
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title animate-rise" style="animation-delay: 40ms">智策题境</h1>
          <p class="hero-subtitle animate-rise" style="animation-delay: 100ms">把教材、讲义和培训文档整理成可编辑题库，再生成练习、试卷与解析。</p>
          <div class="hero-actions animate-rise" style="animation-delay: 160ms">
            <n-button type="primary" size="large" round class="start-btn" @click="router.push('/login')">
              立即使用
              <template #icon>
                <n-icon><ArrowForwardOutline /></n-icon>
              </template>
            </n-button>
          </div>
          <div class="hero-proof animate-rise" aria-label="产品能力摘要" style="animation-delay: 220ms">
            <div v-for="(item, index) in proofItems" :key="item.label" class="proof-item animate-rise" :style="{ animationDelay: `${260 + index * 70}ms` }">
              <strong>{{ item.value }}</strong>
              <span>{{ item.label }}</span>
            </div>
          </div>
        </div>
        <div class="hero-console" aria-label="智能出题工作流预览">
          <div class="console-header"><span>智能出题任务</span><span class="live-state">AI 已就绪</span></div>
          <div class="console-meta"><span>高等数学</span><strong>极限与连续</strong><small>生成 12 题</small></div>
          <div class="console-row active"><b>01</b><span>函数极限的计算</span><em>已生成</em></div>
          <div class="console-row"><b>02</b><span>连续性的判定</span><em>待校验</em></div>
          <div class="console-formula">\(\lim_{x \to 0} \frac{\sin x}{x} = 1\)</div>
          <div class="console-progress"><i></i></div>
        </div>
      </section>

      <!-- Features Section -->
      <section class="features-section">
        <h2 v-reveal class="section-title">把出题流程压进一个工作台</h2>
        <div class="features-grid">
          <div v-for="(feat, index) in features" :key="feat.title" v-reveal="{ delay: index * 80 }" class="feature-card">
            <div class="feature-icon-wrapper">
              <n-icon size="32" class="feature-icon"><component :is="feat.icon" /></n-icon>
            </div>
            <h3 class="feature-title">{{ feat.title }}</h3>
            <p class="feature-desc">{{ feat.desc }}</p>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section v-reveal class="cta-section">
        <h2>从下一份资料开始</h2>
        <p>登录后上传资料，选择章节和题型，让系统先完成题目初稿。</p>
        <n-button type="primary" size="large" round @click="router.push('/login')">开始免费试用</n-button>
      </section>
    </main>

    <footer class="footer">
      <div class="footer-content">
        <div class="footer-links">
          <span>© {{ new Date().getFullYear() }} 智策题境. 保留所有权利.</span>
          <span class="footer-muted">隐私政策</span>
          <span class="footer-muted">服务条款</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 8% 18%, var(--app-cyan-soft), transparent 28rem),
    radial-gradient(circle at 96% 10%, var(--app-amber-soft), transparent 24rem),
    radial-gradient(circle at 72% 82%, var(--app-mint-soft), transparent 30rem),
    linear-gradient(180deg, rgba(255,255,255,0.44), rgba(238,241,245,0.22)),
    #eef1f5;
  color: #19232d;
  overflow-x: hidden;
}

:global(html[data-theme="dark"]) .landing-page {
  background:
    radial-gradient(circle at 8% 18%, rgba(98, 182, 208, 0.12), transparent 28rem),
    radial-gradient(circle at 96% 10%, rgba(224, 165, 72, 0.1), transparent 24rem),
    radial-gradient(circle at 72% 82%, rgba(100, 199, 165, 0.1), transparent 30rem),
    #101014;
  color: rgba(255, 255, 255, 0.9);
}
:global(html[data-theme="dark"]) .hero-title { color: #f3f5f7; }
:global(html[data-theme="dark"]) .hero-console { background: #191d22; border-color: #343a41; box-shadow: 0 34px 70px rgba(0,0,0,.32); }
:global(html[data-theme="dark"]) .console-header,
:global(html[data-theme="dark"]) .console-row { border-color: #343a41; }
:global(html[data-theme="dark"]) .console-row.active,
:global(html[data-theme="dark"]) .console-formula { background: #222831; color: #e5eaf0; }

/* Header */
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 max(24px, calc((100vw - 1320px) / 2));
  background: rgba(238, 241, 245, 0.86);
  backdrop-filter: blur(12px);
  z-index: 100;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
:global(html[data-theme="dark"]) .header {
  background: rgba(16, 16, 20, 0.85);
  border-bottom-color: rgba(255,255,255,0.06);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo-img {
  width: 32px;
  height: 32px;
  border-radius: 6px;
}
.logo-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0;
}
.nav-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.nav-link {
  font-weight: 500;
}

/* Hero Section */
.hero-section {
  position: relative;
  width: min(1320px, calc(100% - 64px));
  min-height: 96dvh;
  margin: 0 auto;
  padding: 138px 0 110px;
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(480px, 1.1fr);
  align-items: center;
  gap: clamp(48px, 7vw, 110px);
  overflow: hidden;
}
.hero-content {
  position: relative;
  z-index: 2;
  max-width: 670px;
}
.hero-title {
  font-size: clamp(50px, 5.1vw, 76px);
  font-weight: 780;
  line-height: 1.05;
  margin: 0 0 24px;
  color: #19232d;
  letter-spacing: 0;
  text-wrap: balance;
}
.hero-subtitle {
  max-width: 580px;
  font-size: 18px;
  color: #68737f;
  margin: 0 0 40px;
  line-height: 1.8;
}
:global(html[data-theme="dark"]) .hero-subtitle {
  color: #aaa;
}
.start-btn {
  font-size: 18px;
  padding: 0 32px;
  height: 54px;
  border-radius: 5px;
  box-shadow: none;
  transition:
    transform var(--motion-base) var(--ease-out),
    box-shadow var(--motion-base) var(--ease-out),
    background-color var(--motion-base) ease;
}

.hero-proof { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 34px; max-width: 620px; }
.proof-item {
  padding: 16px 14px;
  background: rgba(255,255,255,0.62);
  border: 1px solid rgba(49,62,80,0.1);
  border-radius: 8px;
  transition:
    transform var(--motion-base) var(--ease-out),
    box-shadow var(--motion-base) var(--ease-out),
    border-color var(--motion-base) ease;
}
.proof-item strong { display: block; color: #19232d; font-size: 14px; font-weight: 760; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.proof-item span { display: block; margin-top: 5px; color: #6d7784; font-size: 12px; }
:global(html[data-theme="dark"]) .proof-item { background: rgba(29,32,38,0.72); border-color: rgba(255,255,255,0.08); }
:global(html[data-theme="dark"]) .proof-item strong { color: #f3f5f7; }
:global(html[data-theme="dark"]) .proof-item span { color: rgba(203,213,225,0.72); }

.hero-console {
  min-height: 470px;
  padding: 26px;
  background: #fff;
  border: 1px solid #dce1e5;
  border-radius: 8px;
  box-shadow: 0 34px 70px rgba(30,43,56,.13);
  transform: rotate(1.2deg);
  position: relative;
  overflow: hidden;
  animation: hero-console-in 760ms var(--ease-out) 120ms both;
  will-change: transform, opacity;
}
.hero-console::before { content: ''; position: absolute; inset: -12px 18px auto; height: 18px; border: 1px solid color-mix(in srgb, var(--app-cyan) 25%, transparent); border-bottom: 0; border-radius: 8px 8px 0 0; opacity: .75; }
.hero-console::after { content: ''; position: absolute; top: -90px; right: -70px; width: 210px; height: 210px; background: radial-gradient(circle, var(--app-amber-soft), transparent 68%); pointer-events: none; }
.console-header { display: flex; justify-content: space-between; padding-bottom: 22px; border-bottom: 1px solid #e3e6e8; font-size: 13px; font-weight: 600; }
.live-state { color: var(--app-mint); }
.live-state::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: currentColor;
  animation: live-state-pulse 2.2s ease-in-out infinite;
}
.console-meta { padding: 34px 0; display: grid; gap: 7px; }
.console-meta span, .console-meta small { color: #74808b; font-size: 11px; }
.console-meta strong { font-size: 22px; }
.console-row { min-height: 70px; padding: 0 14px; display: grid; grid-template-columns: 38px 1fr auto; align-items: center; border-top: 1px solid #e3e6e8; font-size: 13px; }
.console-row.active { background: #f1f4fa; border-top-color: transparent; }
.console-row b { color: #89939d; font-size: 11px; font-weight: 500; }
.console-row em { color: var(--app-mint); font-size: 11px; font-style: normal; }
.console-formula { margin: 24px 0; padding: 18px; color: #28384a; background: #f7f8f9; font-family: Georgia, serif; text-align: center; }
.console-progress { height: 4px; overflow: hidden; background: #e8ebee; }
.console-progress i { display: block; width: 72%; height: 100%; background: linear-gradient(90deg, var(--app-accent), var(--app-mint), var(--app-amber)); animation: progress 2.5s ease-in-out infinite alternate; }

/* Sections Common */
.section-title {
  text-align: center;
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 60px;
}

/* Features */
.features-section {
  padding: 130px 40px 150px;
  max-width: 1320px;
  margin: 0 auto;
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0;
  border-top: 1px solid #d6dce0;
  border-left: 1px solid #d6dce0;
  grid-auto-flow: dense;
}
.feature-card {
  --feature-tone: var(--app-accent);
  --feature-soft: var(--app-accent-soft);
  min-height: 270px;
  background: transparent;
  padding: 34px;
  border-radius: 0;
  box-shadow: none;
  transition:
    transform var(--motion-base) var(--ease-out),
    background-color var(--motion-base) ease,
    box-shadow var(--motion-base) var(--ease-out);
  border-right: 1px solid #d6dce0;
  border-bottom: 1px solid #d6dce0;
}
:global(html[data-theme="dark"]) .feature-card {
  background: #18181c;
  border-color: rgba(255,255,255,0.05);
  box-shadow: 0 4px 24px rgba(0,0,0,0.2);
}
.feature-card:nth-child(2) { --feature-tone: var(--app-mint); --feature-soft: var(--app-mint-soft); }
.feature-card:nth-child(3) { --feature-tone: var(--app-amber); --feature-soft: var(--app-amber-soft); }
.feature-card:nth-child(4) { --feature-tone: var(--app-cyan); --feature-soft: var(--app-cyan-soft); }
:global(html[data-theme="dark"]) .feature-card:hover {
  background: #20242b;
}
.feature-icon-wrapper {
  width: 64px;
  height: 64px;
  background: var(--feature-soft);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  color: var(--feature-tone);
  transition:
    transform var(--motion-base) var(--ease-out),
    box-shadow var(--motion-base) var(--ease-out);
}
.feature-title {
  color: var(--feature-tone);
  font-size: 20px;
  font-weight: 650;
  margin-bottom: 12px;
}
.feature-desc {
  color: #666;
  line-height: 1.6;
}
:global(html[data-theme="dark"]) .feature-desc { color: #999; }

/* CTA */
.cta-section {
  padding: 120px 20px 135px;
  text-align: center;
  background: #19232d;
  color: #fff;
}
.cta-section h2 {
  font-size: 40px;
  font-weight: 700;
  margin-bottom: 16px;
}
.cta-section p {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.72);
  margin-bottom: 32px;
}
:global(html[data-theme="dark"]) .cta-section p { color: #aaa; }

/* Footer */
.footer {
  padding: 40px;
  border-top: 1px solid rgba(0,0,0,0.06);
  background: #fff;
}
:global(html[data-theme="dark"]) .footer {
  background: #18181c;
  border-top-color: rgba(255,255,255,0.06);
}
.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}
.footer-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}
.footer-logo {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}
.footer-links {
  color: #888;
  font-size: 14px;
  display: flex;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
}
.footer-muted {
  color: #6d7784;
}

@media (max-width: 768px) {
  .hero-title { font-size: 40px; }
  .hero-subtitle { font-size: 18px; }
  .header { padding: 0 20px; }
  .features-section { padding: 60px 20px; }
  .hero-section { width: calc(100% - 36px); min-height: auto; padding-top: 120px; grid-template-columns: 1fr; }
  .hero-proof { grid-template-columns: 1fr; }
  .hero-console { min-height: 430px; transform: none; animation: none; }
}

@keyframes progress {
  from { width: 44%; }
  to { width: 86%; }
}

@keyframes hero-console-in {
  from {
    opacity: 0;
    transform: translate3d(0, 22px, 0) rotate(1.2deg);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) rotate(1.2deg);
  }
}

@keyframes live-state-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 38%, transparent);
  }
  50% {
    box-shadow: 0 0 0 5px color-mix(in srgb, currentColor 0%, transparent);
  }
}

@media (hover: hover) and (pointer: fine) {
  .start-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(49, 95, 202, 0.22);
  }

  .proof-item:hover {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--app-primary) 24%, transparent);
    box-shadow: 0 14px 28px rgba(30, 43, 56, 0.1);
  }

  .feature-card:hover {
    transform: translateY(-3px);
    background: #fff;
  }

  .feature-card:hover .feature-icon-wrapper {
    transform: translateY(-2px) rotate(-2deg);
    box-shadow: 0 12px 26px color-mix(in srgb, var(--feature-tone) 16%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .console-progress i,
  .live-state::before,
  .hero-console {
    animation: none;
  }
}
</style>
