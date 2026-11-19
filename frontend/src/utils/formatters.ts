/**
 * FINSHIELD AI: Safe formatting and data normalization utilities
 * Protects against null, undefined, NaN, and string decimals from PostgreSQL.
 */

export function safeNumber(val: any, fallback: number = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? fallback : num;
}

export function formatCurrency(val: any, decimals: number = 2): string {
  const num = safeNumber(val, 0);
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatDate(val: any, fallback: string = 'N/A'): string {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString('en-IN');
  } catch {
    return fallback;
  }
}

export function formatDateTime(val: any, fallback: string = 'N/A'): string {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleString('en-IN');
  } catch {
    return fallback;
  }
}

export function safeArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [];
}

export function safeJsonParse<T = any>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val as T;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
