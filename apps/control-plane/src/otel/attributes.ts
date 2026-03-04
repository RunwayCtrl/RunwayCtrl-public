import type { Attributes } from '@opentelemetry/api';

// Stable, contract-defined RunwayCtrl custom span attribute keys.
// See: Documentation/02-otel-contract.md
const ALLOWED_RUNWAYCTRL_KEYS = new Set<string>([
  'runwayctrl.tenant_id',
  'runwayctrl.request_id',
  'runwayctrl.action_key',
  'runwayctrl.attempt_id',
  'runwayctrl.tool',
  'runwayctrl.action',
  'runwayctrl.resource_key',
  'runwayctrl.decision',
  'runwayctrl.deny_reason',
  'runwayctrl.retry_after_ms',
  'runwayctrl.failure_class',
  'runwayctrl.outcome',
]);

const clampString = (value: string, maxLen: number): string => {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen);
};

const sanitizeValue = (value: unknown): string | number | boolean | undefined => {
  if (typeof value === 'string') return clampString(value, 256);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  return undefined;
};

export const pickRunwayctrlAttributes = (
  input: Record<string, unknown> | undefined,
): Attributes | undefined => {
  if (!input) return undefined;

  const out: Attributes = {};
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_RUNWAYCTRL_KEYS.has(k)) continue;
    const sv = sanitizeValue(v);
    if (sv === undefined) continue;
    out[k] = sv;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};
