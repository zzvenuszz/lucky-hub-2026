export const METRIC_FIELD_ORDER = [
  'weight',
  'bodyFat',
  'muscleMass',
  'balanceIndex',
  'visceralFat',
  'boneMinerals',
  'waterPercent',
  'energy',
  'bioAge',
] as const;

export type MetricFieldKey = typeof METRIC_FIELD_ORDER[number];
export const OTHER_METRIC_SCALE_CODE = 'OTHER';
export const OTHER_METRIC_SCALE_LABEL = 'Loại cân khác';

export interface MetricScaleModel {
  code: string;
  name: string;
  order: MetricFieldKey[];
}

export const METRIC_FIELD_LABELS: Record<MetricFieldKey, string> = {
  weight: 'Cân nặng (kg)',
  bodyFat: 'Mỡ cơ thể (%)',
  muscleMass: 'Lượng cơ (kg)',
  balanceIndex: 'Cân đối',
  visceralFat: 'Mỡ nội tạng',
  boneMinerals: 'Khoáng chất (kg)',
  waterPercent: 'Nước (%)',
  energy: 'Năng Lượng (kcal)',
  bioAge: 'Tuổi sinh học',
};

export const DEFAULT_METRIC_SCALES: MetricScaleModel[] = [
  {
    code: 'BC-541N',
    name: 'Cân Trắng',
    order: ['weight', 'bodyFat', 'boneMinerals', 'waterPercent', 'muscleMass', 'balanceIndex', 'energy', 'bioAge', 'visceralFat'],
  },
  {
    code: 'BC-313',
    name: 'BC-313',
    order: ['weight', 'bodyFat', 'visceralFat', 'muscleMass', 'balanceIndex', 'boneMinerals', 'energy', 'bioAge', 'waterPercent'],
  },
];

const METRIC_FIELD_SET = new Set<string>(METRIC_FIELD_ORDER);

export function normalizeMetricScales(value: unknown): MetricScaleModel[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_METRIC_SCALES.map(scale => ({ ...scale, order: [...scale.order] }));

  const seenCodes = new Set<string>();
  const scales: MetricScaleModel[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { code?: unknown; name?: unknown; order?: unknown };
    const code = typeof candidate.code === 'string' ? candidate.code.trim().slice(0, 40) : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 80) : '';
    const codeKey = code.toUpperCase();
    if (!code || !name || seenCodes.has(codeKey)) continue;
    seenCodes.add(codeKey);

    const configuredOrder = Array.isArray(candidate.order) ? candidate.order : [];
    const order = configuredOrder.filter((field): field is MetricFieldKey => typeof field === 'string' && METRIC_FIELD_SET.has(field));
    const uniqueOrder = [...new Set(order)];
    scales.push({
      code,
      name,
      order: [...uniqueOrder, ...METRIC_FIELD_ORDER.filter(field => !uniqueOrder.includes(field))],
    });
  }

  return scales.length ? scales : DEFAULT_METRIC_SCALES.map(scale => ({ ...scale, order: [...scale.order] }));
}
