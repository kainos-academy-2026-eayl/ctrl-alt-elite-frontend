import { isCount, isRecord } from './adminOrders';

export const DEFAULT_REPORT_DAYS = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ReportRange {
  from: string;
  to: string;
}

export interface SalesReport {
  range: ReportRange;
  summary: {
    totalOrders: number;
    totalRevenuePence: number;
    averageOrderValuePence: number;
    unitsSold: number;
  };
  ordersByStatus: Array<{ status: string; count: number }>;
  dailySales: Array<{ date: string; orders: number; revenuePence: number }>;
  topProducts: Array<{
    productId: string;
    name: string;
    unitsSold: number;
    revenuePence: number;
  }>;
}

export function isValidReportDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function formatReportDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultReportRange(now: Date = new Date()): ReportRange {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (DEFAULT_REPORT_DAYS - 1));
  return { from: formatReportDate(from), to: formatReportDate(now) };
}

export function readReportRange(
  searchParams: URLSearchParams,
  now: Date = new Date(),
): ReportRange {
  const fallback = defaultReportRange(now);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!isValidReportDate(from) || !isValidReportDate(to) || from > to) {
    return fallback;
  }
  return { from, to };
}

export function validateReportRange(range: ReportRange): string | undefined {
  if (!isValidReportDate(range.from) || !isValidReportDate(range.to)) {
    return 'Enter a valid start and end date.';
  }
  if (range.from > range.to) {
    return 'The start date must be on or before the end date.';
  }
  return undefined;
}

export function reportRangeParams(range: ReportRange): URLSearchParams {
  return new URLSearchParams({ from: range.from, to: range.to });
}

function parseList<T>(
  value: unknown,
  parseItem: (item: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(parseItem);
  return items.every((item) => item !== undefined) ? (items as T[]) : undefined;
}

export function parseSalesReport(value: unknown): SalesReport | undefined {
  if (!isRecord(value) || !isRecord(value.range) || !isRecord(value.summary)) {
    return undefined;
  }
  const { range, summary } = value;
  const ordersByStatus = parseList(value.ordersByStatus, (item) =>
    isRecord(item) && typeof item.status === 'string' && isCount(item.count)
      ? { status: item.status, count: item.count }
      : undefined,
  );
  const dailySales = parseList(value.dailySales, (item) =>
    isRecord(item) &&
    typeof item.date === 'string' &&
    isCount(item.orders) &&
    isCount(item.revenuePence)
      ? {
          date: item.date,
          orders: item.orders,
          revenuePence: item.revenuePence,
        }
      : undefined,
  );
  const topProducts = parseList(value.topProducts, (item) =>
    isRecord(item) &&
    typeof item.productId === 'string' &&
    typeof item.name === 'string' &&
    isCount(item.unitsSold) &&
    isCount(item.revenuePence)
      ? {
          productId: item.productId,
          name: item.name,
          unitsSold: item.unitsSold,
          revenuePence: item.revenuePence,
        }
      : undefined,
  );
  if (
    typeof range.from !== 'string' ||
    typeof range.to !== 'string' ||
    !isCount(summary.totalOrders) ||
    !isCount(summary.totalRevenuePence) ||
    !isCount(summary.averageOrderValuePence) ||
    !isCount(summary.unitsSold) ||
    !ordersByStatus ||
    !dailySales ||
    !topProducts
  ) {
    return undefined;
  }
  return {
    range: { from: range.from, to: range.to },
    summary: {
      totalOrders: summary.totalOrders,
      totalRevenuePence: summary.totalRevenuePence,
      averageOrderValuePence: summary.averageOrderValuePence,
      unitsSold: summary.unitsSold,
    },
    ordersByStatus,
    dailySales,
    topProducts,
  };
}
