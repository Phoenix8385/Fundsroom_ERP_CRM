import type { ChallanStatus, CustomerStatus, Decimalish } from '../types/api';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

const dateOnly = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Decimal columns arrive as strings, so coerce before formatting. */
export function formatMoney(value: Decimalish): string {
  const amount = typeof value === 'string' ? Number(value) : value;

  return Number.isFinite(amount) ? currency.format(amount) : '—';
}

export function formatDate(value: string | null): string {
  if (!value) return '—';

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? '—' : dateOnly.format(parsed);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
}

/** Trims an ISO timestamp down to the `yyyy-MM-dd` a date input expects. */
export function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function challanTone(status: ChallanStatus): Tone {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  return 'info';
}

export function customerTone(status: CustomerStatus): Tone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'neutral';
  return 'info';
}
