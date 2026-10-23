<script setup lang="ts">
const icons: Record<string, string[]> = {
  dashboard: ['M4 4h6.5v6.5H4z', 'M13.5 4H20v5h-6.5z', 'M13.5 11H20v9h-6.5z', 'M4 12.5h6.5V20H4z'],
  home: ['M4 11.2 12 4l8 7.2', 'M7 10.5V20h10v-9.5'],
  clients: ['M9 11a3 3 0 1 0 .01 0', 'M4 19c.9-3 3-4.5 5.5-4.5S14.1 16 15 19', 'M16 11.2a2.3 2.3 0 1 0 .01 0', 'M15 14.6c1.8.2 3.2 1.2 4 3.4'],
  children: ['M9 11a3 3 0 1 0 .01 0', 'M4 19c.9-3 3-4.5 5.5-4.5S14.1 16 15 19', 'M16 11.2a2.3 2.3 0 1 0 .01 0', 'M15 14.6c1.8.2 3.2 1.2 4 3.4'],
  assessments: ['M8 3.5h8v3H8z', 'M7 5.5h10.5V20H7z', 'M10 11h5', 'M10 14.5h5'],
  programs: ['M12 3.5 20 7.5 12 11.5 4 7.5z', 'M4 12l8 4 8-4', 'M4 16l8 4 8-4'],
  sessions: ['M12 21a8.5 8.5 0 1 0-8.5-8.5A8.5 8.5 0 0 0 12 21z', 'M12 8v4.5l3 2'],
  progress: ['M4 19h16', 'M7 16l3.2-4.2 2.8 2.2L17 8'],
  reports: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'],
  maintenance: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4.5V9h-4.5'],
  team: ['M8.5 11a2.8 2.8 0 1 0 .01 0', 'M3.5 19c.8-2.7 2.6-4 5-4s4.2 1.3 5 4', 'M16 11.2a2.2 2.2 0 1 0 .01 0', 'M14.5 15c1.5.1 2.8.9 3.5 2.6'],
  parentPortal: ['M4 11.2 12 4l8 7.2', 'M7 10.5V20h10v-9.5'],
  messages: ['M5 6h14v9H8l-3 3z'],
  settings: ['M12 15.2a3.2 3.2 0 1 0-.01 0', 'M12 3.5v2.2', 'M12 18.3V20.5', 'M3.5 12h2.2', 'M18.3 12H20.5', 'M6.1 6.1l1.6 1.6', 'M16.3 16.3l1.6 1.6', 'M17.9 6.1l-1.6 1.6', 'M7.7 16.3l-1.6 1.6'],
  organisations: ['M4 20V9l8-5 8 5v11', 'M9 20v-6h6v6'],
  clinics: ['M4 20V9l6-4 6 4v11', 'M16 20V12h4v8', 'M8 12h2', 'M8 16h2'],
};

defineProps<{
  name: string;
}>();
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      v-for="(path, index) in icons[name] ?? icons.dashboard"
      :key="index"
      :d="path"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}
</style>
