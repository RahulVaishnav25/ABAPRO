import type { DashboardTrendPoint } from '@abapro/shared';
import type { EChartsCoreOption } from 'echarts/core';
import { formatShortDate } from '@/lib/format';

export function sessionTrendOption(points: DashboardTrendPoint[]): EChartsCoreOption {
  return {
    color: ['#0e6b62', '#b0893e'],
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#556575' } },
    grid: { left: 40, right: 12, top: 20, bottom: 48 },
    xAxis: {
      type: 'category',
      data: points.map((point) => formatShortDate(point.date)),
      axisLine: { lineStyle: { color: '#d5dde3' } },
      axisLabel: { color: '#556575' },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#e7edf1' } },
      axisLabel: { color: '#556575' },
    },
    series: [
      {
        name: 'Completed',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: points.map((point) => point.completed),
      },
      {
        name: 'Scheduled',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: points.map((point) => point.scheduled),
      },
    ],
  };
}
