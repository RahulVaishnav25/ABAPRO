<script setup lang="ts">
import { computed } from 'vue';
import sceneUrl from '@/assets/clinic-session.jpg';
import appIconUrl from '@/assets/brand/app-icon.png';
import { useBrandingStore } from '@/stores/branding';

const branding = useBrandingStore();

const brandName = computed(() => branding.platformBranding.portalName || 'ABAPro');
const brandLogo = computed(() => branding.platformBranding.logoUrl || appIconUrl);
const headline = computed(() => branding.platformBranding.loginHeadline || 'Better care starts with clarity.');
const subtitle = computed(
  () => branding.platformBranding.loginSubtitle || "One simple workspace for your team, your sessions, and every client's progress.",
);

const bgStyle = computed(() => {
  const p = branding.platformBranding.primaryColor || '#14665e';
  const s = branding.platformBranding.secondaryColor || '#0c3330';
  return {
    background: `radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.12), transparent 34%), linear-gradient(165deg, ${p} 0%, ${s} 100%)`,
  };
});
</script>

<template>
  <section class="intro" :style="bgStyle">
    <div class="intro-copy">
      <p class="brand">
        <img :src="brandLogo" :alt="brandName" class="brand-badge" />
        <span>{{ brandName }}</span>
      </p>
      <h1>{{ headline }}</h1>
      <p class="marketing">{{ subtitle }}</p>
    </div>
    <figure class="scene">
      <img :src="sceneUrl" alt="Therapist and client stacking colorful blocks together at a table in a bright therapy room" />
    </figure>
    <ul class="points">
      <li>
        <svg class="point-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 11a2.8 2.8 0 1 0 .01 0M3.5 19c.8-2.7 2.6-4 5-4s4.2 1.3 5 4M16 11.2a2.2 2.2 0 1 0 .01 0M14.5 15c1.5.1 2.8.9 3.5 2.6" />
        </svg>
        <div>
          <strong>Your team, connected</strong>
          <span>Keep therapists and supervisors on the same page.</span>
        </div>
      </li>
      <li>
        <svg class="point-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 19h16M7 16l3.2-4.2 2.8 2.2L17 8" />
        </svg>
        <div>
          <strong>Progress you can understand</strong>
          <span>Track goals and celebrate meaningful milestones.</span>
        </div>
      </li>
      <li>
        <svg class="point-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19s-6.5-4.1-6.5-8.2A3.4 3.4 0 0 1 12 8.2a3.4 3.4 0 0 1 6.5 2.6C18.5 14.9 12 19 12 19z" />
        </svg>
        <div>
          <strong>Care that stays personal</strong>
          <span>Make collaboration with families easier.</span>
        </div>
      </li>
    </ul>
    <p class="closing">Supporting the people behind every little milestone.</p>
  </section>
</template>

<style scoped>
.intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
  min-width: 0;
  overflow: hidden;
  padding: 32px 48px 24px;
  color: #f4fbfa;
  transition: background 0.3s ease;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}

.brand-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #ffffff;
  padding: 4px;
  object-fit: contain;
  flex: 0 0 auto;
}

.intro h1 {
  margin-top: 8px;
  font-size: clamp(1.7rem, 2.2vw, 2.35rem);
  line-height: 1.15;
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.marketing {
  color: rgba(244, 251, 250, 0.86);
  white-space: nowrap;
}

.scene {
  margin: 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.24);
  max-width: 620px;
}

.scene img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.points li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.94rem;
}

.points li strong {
  display: block;
  font-size: 0.98rem;
  line-height: 1.25;
}

.points li span {
  display: block;
  color: rgba(244, 251, 250, 0.8);
  font-size: 0.88rem;
  line-height: 1.35;
}

.point-icon {
  width: 18px;
  height: 18px;
  stroke: #ffffff;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  flex-shrink: 0;
  margin-top: 2px;
}

.closing {
  font-size: 0.85rem;
  color: rgba(244, 251, 250, 0.72);
  margin-top: 4px;
}

@media (max-width: 1100px) {
  .intro {
    padding: 24px 32px 20px;
  }
}
</style>
