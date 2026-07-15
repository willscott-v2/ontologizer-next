'use client'

type AnalyticsValue = string | number | boolean | undefined;

export function trackEvent(
  event: string,
  metadata: Record<string, AnalyticsValue> = {},
): void {
  if (typeof window === 'undefined') return;
  const dataLayer = (window as typeof window & { dataLayer?: Array<Record<string, AnalyticsValue>> }).dataLayer;
  if (!dataLayer) return;
  dataLayer.push({ event, ...metadata });
}
