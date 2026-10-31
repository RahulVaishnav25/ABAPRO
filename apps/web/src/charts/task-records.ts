import { PROMPT_LEVEL_OPTIONS, type TaskRecordDay } from '@abapro/shared';
import type { EChartsCoreOption } from 'echarts/core';
import { formatShortDate } from '@/lib/format';

const axis = { color: '#556575' };
const line = { color: '#d5dde3' };
const split = { color: '#e7edf1' };

// Checked for colour-blind separation and contrast. No also differs by marker and a dashed line.
const YES_COLOR = '#0d9488';
const NO_COLOR = '#c2410c';

/** Yes and No counts per recorded day. */
export function taskRecordsOption(days: TaskRecordDay[]): EChartsCoreOption | null {
  if (days.length === 0) return null;
  return {
    color: [YES_COLOR, NO_COLOR],
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 4, textStyle: { color: '#25313b' } },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: days.map((day) => formatShortDate(day.date)),
      axisLine: { lineStyle: line },
      axisLabel: axis,
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: split },
      axisLabel: axis,
    },
    series: [
      {
        name: 'Yes',
        type: 'line',
        // Drawn above No, inside No's hollow marker when the counts match.
        z: 3,
        data: days.map((day) => day.yes),
        symbol: 'circle',
        symbolSize: 9,
        // A surface ring keeps the point clear of the No marker around it.
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        lineStyle: { width: 2 },
      },
      {
        name: 'No',
        type: 'line',
        z: 2,
        data: days.map((day) => day.no),
        // Hollow, so a Yes point on the same count still shows inside it.
        symbol: 'emptyDiamond',
        symbolSize: 16,
        itemStyle: { borderWidth: 2 },
        lineStyle: { width: 2, type: 'dashed' },
      },
    ],
  };
}

export function taskRecordsSummary(days: TaskRecordDay[]): string {
  return days.map((day) => `${day.date}: ${day.yes} yes, ${day.no} no`).join('. ');
}

// Six categorical slots, checked for colour-blind separation. Three sit below 3:1 on white, so every level
// also has its own marker, and the records table lists the same data.
const PROMPT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const PROMPT_SYMBOLS = ['circle', 'rect', 'triangle', 'diamond', 'pin', 'roundRect'];

export function hasYesNo(days: TaskRecordDay[]): boolean {
  return days.some((day) => day.yes + day.no > 0);
}

export function hasPrompts(days: TaskRecordDay[]): boolean {
  return days.some((day) => Object.values(day.prompts).some((count) => count > 0));
}

/** How often each prompt level was selected per recorded day. A record may select several levels. */
export function promptLevelsOption(days: TaskRecordDay[]): EChartsCoreOption | null {
  if (!hasPrompts(days)) return null;
  return {
    color: PROMPT_COLORS,
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: '#25313b' } },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: days.map((day) => formatShortDate(day.date)),
      axisLine: { lineStyle: line },
      axisLabel: axis,
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: split },
      axisLabel: axis,
    },
    series: PROMPT_LEVEL_OPTIONS.map((option, index) => ({
      name: option.label,
      type: 'line',
      data: days.map((day) => day.prompts[option.value]),
      symbol: PROMPT_SYMBOLS[index],
      symbolSize: 9,
      itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
      lineStyle: { width: 2 },
    })),
  };
}

export function promptLevelsSummary(days: TaskRecordDay[]): string {
  return days
    .map((day) => `${day.date}: ${PROMPT_LEVEL_OPTIONS.map((option) => `${day.prompts[option.value]} ${option.label}`).join(', ')}`)
    .join('. ');
}
