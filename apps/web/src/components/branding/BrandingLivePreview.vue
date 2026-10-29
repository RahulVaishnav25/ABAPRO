<script setup lang="ts">
import { computed, ref } from 'vue';
import appIconUrl from '@/assets/brand/app-icon.png';
import AppButton from '@/components/ui/AppButton.vue';
import { adjustBrightness, hexToRgba } from '@/lib/theme';

const props = withDefaults(
  defineProps<{
    draft: {
      portalName: string;
      logoUrl: string;
      faviconUrl: string;
      primaryColor: string;
      secondaryColor: string;
      loginHeadline?: string;
      loginSubtitle?: string;
    };
    isPlatform?: boolean;
    isDirty?: boolean;
    saving?: boolean;
  }>(),
  {
    isPlatform: false,
    isDirty: false,
    saving: false,
  },
);

const emit = defineEmits<{
  save: [];
  cancel: [];
  reset: [];
}>();

const activeTab = ref<'portal' | 'login'>('portal');

const effectiveLogo = computed(() => props.draft.logoUrl?.trim() || appIconUrl);
const effectiveName = computed(() => props.draft.portalName?.trim() || (props.isPlatform ? 'ABAPro' : 'My Organisation'));
const effectiveHeadline = computed(() => props.draft.loginHeadline?.trim() || 'Better care starts with clarity.');
const effectiveSubtitle = computed(
  () => props.draft.loginSubtitle?.trim() || "One simple workspace for your team, your sessions, and every client's progress.",
);

const previewStyles = computed(() => {
  const p = props.draft.primaryColor || '#0e6b62';
  const s = props.draft.secondaryColor || '#18794e';
  return {
    '--preview-primary': p,
    '--preview-primary-hover': adjustBrightness(p, -12),
    '--preview-primary-soft': hexToRgba(p, 0.12),
    '--preview-primary-ink': adjustBrightness(p, -28),
    '--preview-secondary': s,
    '--preview-secondary-hover': adjustBrightness(s, -12),
    '--preview-secondary-soft': hexToRgba(s, 0.12),
  };
});
</script>

<template>
  <div class="live-preview-panel" :style="previewStyles">
    <div class="preview-header">
      <div class="preview-title-wrap">
        <span class="preview-badge">Live Preview</span>
        <span class="preview-desc">Instant real-time preview (changes remain unapplied to live portal until saved)</span>
      </div>
      <div class="preview-tabs">
        <button
          type="button"
          class="preview-tab"
          :class="{ active: activeTab === 'portal' }"
          @click="activeTab = 'portal'"
        >
          App Portal & Buttons
        </button>
        <button
          v-if="isPlatform"
          type="button"
          class="preview-tab"
          :class="{ active: activeTab === 'login' }"
          @click="activeTab = 'login'"
        >
          Login Page
        </button>
      </div>
    </div>

    <!-- PREVIEW VIEWPORT -->
    <div class="preview-viewport">
      <!-- 1. PORTAL PREVIEW (Sidebar, Top Bar, Buttons) -->
      <div v-if="activeTab === 'portal'" class="mockup-portal">
        <!-- Mockup Top Bar -->
        <header class="mock-topbar">
          <div class="mock-topbar-start">
            <span class="mock-icon-btn">☰</span>
            <span class="mock-portal-title">{{ effectiveName }}</span>
          </div>
          <div class="mock-topbar-end">
            <span class="mock-bell">🔔</span>
            <div class="mock-user-pill">
              <span class="mock-user-avatar">A</span>
              <span class="mock-user-name">Admin</span>
            </div>
          </div>
        </header>

        <!-- Mockup Body (Sidebar + Content) -->
        <div class="mock-body">
          <!-- Mockup Sidebar -->
          <aside class="mock-sidebar">
            <div class="mock-brand">
              <img :src="effectiveLogo" alt="Brand" class="mock-logo" />
              <div class="mock-brand-info">
                <strong class="mock-brand-name">{{ effectiveName }}</strong>
                <span class="mock-brand-sub">Management</span>
              </div>
            </div>

            <nav class="mock-nav">
              <div class="mock-nav-item active">
                <span class="mock-nav-icon">📊</span>
                <span>Dashboard</span>
              </div>
              <div class="mock-nav-item">
                <span class="mock-nav-icon">📋</span>
                <span>Programs</span>
              </div>
              <div class="mock-nav-item">
                <span class="mock-nav-icon">☑️</span>
                <span>Tasks</span>
              </div>
              <div class="mock-nav-item">
                <span class="mock-nav-icon">⚙️</span>
                <span>Settings</span>
              </div>
            </nav>
          </aside>

          <!-- Mockup Main Workspace with Buttons -->
          <main class="mock-main">
            <div class="mock-content-card">
              <h3 class="mock-card-title">Branded UI Components</h3>
              <p class="mock-card-copy">
                These elements automatically inherit your primary and secondary palette:
              </p>

              <!-- Buttons Preview Showcase -->
              <div class="mock-buttons-section">
                <span class="mock-section-label">Buttons</span>
                <div class="mock-button-row">
                  <button type="button" class="mock-btn-primary">
                    Primary Button
                  </button>
                  <button type="button" class="mock-btn-secondary">
                    Secondary Button
                  </button>
                  <button type="button" class="mock-btn-soft">
                    Soft Accent
                  </button>
                  <button type="button" class="mock-btn-outline">
                    Outline
                  </button>
                </div>
              </div>

              <!-- Status & Badges Showcase -->
              <div class="mock-badges-section">
                <span class="mock-section-label">Badges & Accents</span>
                <div class="mock-badge-row">
                  <span class="mock-badge mock-badge-primary">Active Target</span>
                  <span class="mock-badge mock-badge-secondary">Baseline 100%</span>
                  <span class="mock-badge mock-badge-outline">Criteria Met</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      <!-- 2. LOGIN PAGE PREVIEW -->
      <div v-else class="mockup-login">
        <div class="mock-login-left">
          <div class="mock-login-brand">
            <img :src="effectiveLogo" alt="Brand" class="mock-login-logo" />
            <span>{{ effectiveName }}</span>
          </div>
          <h2 class="mock-login-headline">{{ effectiveHeadline }}</h2>
          <p class="mock-login-subtitle">{{ effectiveSubtitle }}</p>
          <div class="mock-login-bullet">
            <span>✓</span> Connected clinical workspace
          </div>
        </div>

        <div class="mock-login-right">
          <div class="mock-login-card">
            <h4>Sign in to {{ effectiveName }}</h4>
            <div class="mock-input-field">
              <span class="mock-input-label">Email</span>
              <div class="mock-input-box">admin@example.com</div>
            </div>
            <div class="mock-input-field">
              <span class="mock-input-label">Password</span>
              <div class="mock-input-box">••••••••••••</div>
            </div>
            <button type="button" class="mock-btn-primary full">Sign in</button>
          </div>
        </div>
      </div>
    </div>

    <!-- PREVIEW CONTROLS BAR -->
    <div class="preview-actions-bar">
      <div class="preview-status">
        <span v-if="isDirty" class="status-unsaved">● Unsaved edits in preview</span>
        <span v-else class="status-synced">✓ Matches saved branding</span>
      </div>
      <div class="preview-btns">
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          @click="emit('reset')"
        >
          Reset to Defaults
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          :disabled="!isDirty"
          @click="emit('cancel')"
        >
          Cancel
        </AppButton>
        <button
          type="button"
          class="btn-save-branding"
          :disabled="saving"
          @click="emit('save')"
        >
          <span v-if="saving" class="spinner" aria-hidden="true"></span>
          Save Branding
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-preview-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: var(--color-surface-muted);
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
  flex-wrap: wrap;
}

.preview-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preview-badge {
  display: inline-flex;
  align-items: center;
  background: var(--preview-primary);
  color: #ffffff;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 4px;
}

.preview-desc {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.preview-tabs {
  display: flex;
  gap: 6px;
  background: var(--color-border);
  padding: 3px;
  border-radius: var(--radius-sm);
}

.preview-tab {
  background: transparent;
  border: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preview-tab.active {
  background: #ffffff;
  color: var(--color-ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* VIEWPORT CONTAINER */
.preview-viewport {
  background: #f1f5f9;
  padding: 16px;
  overflow-x: auto;
  min-height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* MOCKUP PORTAL */
.mockup-portal {
  width: 100%;
  max-width: 860px;
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.mock-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 44px;
  padding: 0 16px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
}

.mock-topbar-start {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mock-icon-btn {
  font-size: 1rem;
  color: #64748b;
}

.mock-portal-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--preview-primary);
}

.mock-topbar-end {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mock-bell {
  font-size: 0.85rem;
  color: #64748b;
}

.mock-user-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--preview-secondary-soft);
  padding: 2px 8px 2px 4px;
  border-radius: 12px;
}

.mock-user-avatar {
  width: 20px;
  height: 20px;
  background: var(--preview-secondary);
  color: #ffffff;
  border-radius: 50%;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.mock-user-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--preview-secondary);
}

/* MOCKUP BODY */
.mock-body {
  display: flex;
  min-height: 280px;
}

.mock-sidebar {
  width: 190px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}

.mock-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
}

.mock-logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: contain;
}

.mock-brand-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mock-brand-name {
  font-size: 0.85rem;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mock-brand-sub {
  font-size: 0.65rem;
  color: #64748b;
}

.mock-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mock-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}

.mock-nav-item.active {
  background: var(--preview-primary-soft);
  color: var(--preview-primary);
  border-left: 3px solid var(--preview-primary);
}

.mock-nav-icon {
  font-size: 0.8rem;
}

/* MOCK MAIN WORKSPACE */
.mock-main {
  flex: 1;
  background: #f8fafc;
  padding: 16px;
}

.mock-content-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mock-card-title {
  font-size: 0.95rem;
  margin: 0;
  color: #0f172a;
}

.mock-card-copy {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
}

.mock-section-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 6px;
  letter-spacing: 0.04em;
}

.mock-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mock-btn-primary {
  background: var(--preview-primary);
  color: #ffffff;
  border: 1px solid var(--preview-primary);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.mock-btn-secondary {
  background: var(--preview-secondary);
  color: #ffffff;
  border: 1px solid var(--preview-secondary);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.mock-btn-soft {
  background: var(--preview-primary-soft);
  color: var(--preview-primary);
  border: 1px solid transparent;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.mock-btn-outline {
  background: #ffffff;
  color: var(--preview-primary);
  border: 1px solid var(--preview-primary);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.mock-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mock-badge {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.mock-badge-primary {
  background: var(--preview-primary-soft);
  color: var(--preview-primary);
}

.mock-badge-secondary {
  background: var(--preview-secondary-soft);
  color: var(--preview-secondary);
}

.mock-badge-outline {
  border: 1px solid var(--preview-primary);
  color: var(--preview-primary);
}

/* MOCKUP LOGIN PAGE */
.mockup-login {
  width: 100%;
  max-width: 800px;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  min-height: 320px;
}

.mock-login-left {
  background: linear-gradient(145deg, var(--preview-primary) 0%, var(--preview-secondary) 100%);
  color: #ffffff;
  padding: 30px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
}

.mock-login-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.25rem;
  font-weight: 700;
}

.mock-login-logo {
  width: 34px;
  height: 34px;
  background: #ffffff;
  border-radius: 8px;
  padding: 3px;
  object-fit: contain;
}

.mock-login-headline {
  font-size: 1.3rem;
  line-height: 1.25;
  margin: 4px 0 0;
  color: #ffffff;
}

.mock-login-subtitle {
  font-size: 0.85rem;
  opacity: 0.9;
  margin: 0;
  line-height: 1.4;
}

.mock-login-bullet {
  font-size: 0.8rem;
  opacity: 0.95;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.mock-login-right {
  background: #ffffff;
  padding: 30px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mock-login-card {
  width: 100%;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mock-login-card h4 {
  margin: 0 0 4px;
  font-size: 1rem;
  color: #0f172a;
}

.mock-input-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mock-input-label {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.mock-input-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.8rem;
  color: #334155;
}

.mock-btn-primary.full {
  width: 100%;
  margin-top: 6px;
  padding: 8px;
}

/* ACTIONS BAR */
.preview-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: #ffffff;
  border-top: 1px solid var(--color-border);
  gap: 12px;
  flex-wrap: wrap;
}

.preview-status {
  font-size: 0.82rem;
  font-weight: 600;
}

.status-unsaved {
  color: #d97706;
}

.status-synced {
  color: #16a34a;
}

.preview-btns {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-save-branding {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 18px;
  background: #b42318;
  color: #ffffff;
  font-weight: 600;
  font-size: 0.88rem;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn-save-branding:hover:not(:disabled) {
  background: #912018;
}

.btn-save-branding:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 680px) {
  .mockup-login {
    grid-template-columns: 1fr;
  }
}
</style>
