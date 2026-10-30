<script setup lang="ts">
const icons: Record<string, string[]> = {
  dashboard: ['M4 4h6.5v6.5H4z', 'M13.5 4H20v5h-6.5z', 'M13.5 11H20v9h-6.5z', 'M4 12.5h6.5V20H4z'],
  home: ['M4 11.2 12 4l8 7.2', 'M7 10.5V20h10v-9.5'],
  clients: ['M9 11a3 3 0 1 0 .01 0', 'M4 19c.9-3 3-4.5 5.5-4.5S14.1 16 15 19', 'M16 11.2a2.3 2.3 0 1 0 .01 0', 'M15 14.6c1.8.2 3.2 1.2 4 3.4'],
  children: ['M9 11a3 3 0 1 0 .01 0', 'M4 19c.9-3 3-4.5 5.5-4.5S14.1 16 15 19', 'M16 11.2a2.3 2.3 0 1 0 .01 0', 'M15 14.6c1.8.2 3.2 1.2 4 3.4'],
  assessments: ['M8 3.5h8v3H8z', 'M7 5.5h10.5V20H7z', 'M10 11h5', 'M10 14.5h5'],
  programs: ['M12 3.5 20 7.5 12 11.5 4 7.5z', 'M4 12l8 4 8-4', 'M4 16l8 4 8-4'],
  tasks: [
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2',
    'M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z',
    'M9 14l2 2 4-4',
  ],
  reports: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'],
  maintenance: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4.5V9h-4.5'],
  team: ['M8.5 11a2.8 2.8 0 1 0 .01 0', 'M3.5 19c.8-2.7 2.6-4 5-4s4.2 1.3 5 4', 'M16 11.2a2.2 2.2 0 1 0 .01 0', 'M14.5 15c1.5.1 2.8.9 3.5 2.6'],
  parentPortal: ['M4 11.2 12 4l8 7.2', 'M7 10.5V20h10v-9.5'],
  messages: ['M5 6h14v9H8l-3 3z'],
  settings: ['M12 15.2a3.2 3.2 0 1 0-.01 0', 'M12 3.5v2.2', 'M12 18.3V20.5', 'M3.5 12h2.2', 'M18.3 12H20.5', 'M6.1 6.1l1.6 1.6', 'M16.3 16.3l1.6 1.6', 'M17.9 6.1l-1.6 1.6', 'M7.7 16.3l-1.6 1.6'],
  organisations: ['M4 20V9l8-5 8 5v11', 'M9 20v-6h6v6'],
  clinics: ['M4 20V9l6-4 6 4v11', 'M16 20V12h4v8', 'M8 12h2', 'M8 16h2'],
  workspace: ['M4 5h4.5v14H4z', 'M10 5h4.5v9H10z', 'M16 5h4v6h-4z'],
  'layout-horizontal': ['M3 8h6v8H3z', 'M11 12h2', 'M15 9h2.5v6H15z', 'M19.5 9H22v6h-2.5z'],
  'layout-vertical': ['M5 3h10v5H5z', 'M8 8v12', 'M8 12h7', 'M8 16.5h7', 'M8 20h7'],
  // Program and task statuses.
  'status-all': ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  'status-in_treatment': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M10 8.5l5.5 3.5-5.5 3.5z'],
  'status-maintenance': ['M20 12a8 8 0 0 1-14.3 4.9', 'M4 12a8 8 0 0 1 14.3-4.9', 'M18.5 3.5v3.6h-3.6', 'M5.5 20.5v-3.6h3.6'],
  'status-on_hold': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M10 9v6', 'M14 9v6'],
  'status-mastered': ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 4', 'M16 6h3a3 3 0 0 1-3 4', 'M12 13v4', 'M9 20h6'],
  notification: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
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
