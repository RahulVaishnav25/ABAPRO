import type { PlatformClinicCountry } from '@abapro/shared';
import type { EChartsCoreOption } from 'echarts/core';

const axis = { color: '#556575' };
const line = { color: '#d5dde3' };
const split = { color: '#e7edf1' };

export function clinicsByCountryOption(points: PlatformClinicCountry[], countryName: (code: string) => string, seriesName = 'Clinics'): EChartsCoreOption | null {
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
        name: seriesName,
        type: 'bar',
        data: points.map((point) => point.clinics),
        barMaxWidth: 28,
      },
    ],
  };
}
