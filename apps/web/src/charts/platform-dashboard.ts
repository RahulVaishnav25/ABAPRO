import type { PlatformClinicCountry, PlatformSessionTrendPoint } from '@abapro/shared';
import type { EChartsCoreOption } from 'echarts/core';
import { formatShortDate } from '@/lib/format';

const axis = { color: '#556575' };
const line = { color: '#d5dde3' };
const split = { color: '#e7edf1' };

export function clinicsByCountryOption(points: PlatformClinicCountry[], countryName: (code: string) => string): EChartsCoreOption | null {
  if (points.length === 0) return null;
  return {
    color: ['#0e6b62'],
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: split },
      axisLabel: axis,
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: points.map((point) => countryName(point.country)),
      axisLine: { lineStyle: line },
      axisLabel: axis,
    },
    series: [
      {
        name: 'Clinics',
        type: 'bar',
        data: points.map((point) => point.clinics),
        barMaxWidth: 28,
      },
    ],
  };
}

export function platformSessionTrendOption(points: PlatformSessionTrendPoint[]): EChartsCoreOption {
  return {
    color: ['#0e6b62', '#b0893e', '#3d6f8f'],
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: axis },
    grid: { left: 40, right: 12, top: 20, bottom: 48 },
    xAxis: {
      type: 'category',
      data: points.map((point) => formatShortDate(point.date)),
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
      { name: 'Completed', type: 'line', smooth: true, showSymbol: true, data: points.map((point) => point.completed) },
      { name: 'Scheduled', type: 'line', smooth: true, showSymbol: true, data: points.map((point) => point.scheduled) },
      { name: 'In progress', type: 'line', smooth: true, showSymbol: true, data: points.map((point) => point.inProgress) },
    ],
  };
}
