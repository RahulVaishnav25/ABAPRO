<script setup lang="ts">
import sceneUrl from '@/assets/clinic-session.jpg';
</script>

<template>
  <section class="intro">
    <div class="intro-copy">
      <p class="brand">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#f4fbfa" />
          <path d="M9 22.5 16 8.5l7 14M11.6 18.2h8.8" />
        </svg>
        <span>ABAPro</span>
      </p>
      <h1>Better care starts with clarity.</h1>
      <p class="marketing">One simple workspace for your team, your sessions, and every client's progress.</p>
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
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.1), transparent 34%),
    linear-gradient(165deg, #14665e 0%, #0c3330 72%);
  color: #f4fbfa;
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

.brand-mark {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
}

.brand-mark path {
  fill: none;
  stroke: #0e6b62;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  width: min(520px, 100%);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
}

.scene img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  object-position: center;
}

.points {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.points li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.point-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  margin-top: 1px;
  color: #9ddecf;
}

.point-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.points div {
  display: grid;
  gap: 2px;
}

.points strong {
  font-size: 1rem;
}

.points span,
.closing {
  color: rgba(244, 251, 250, 0.86);
}

.closing {
  margin: 0;
  font-weight: 600;
  white-space: nowrap;
}

@media (max-width: 1199px) {
  .intro {
    padding: 28px 28px 24px;
  }

  .intro h1,
  .marketing,
  .closing {
    white-space: normal;
  }

  .intro h1 {
    font-size: 1.85rem;
  }
}
</style>
