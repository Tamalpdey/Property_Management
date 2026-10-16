import type { QuotePricingMode } from "@lorne/contracts";

export function quoteDescriptionLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface QuotePricingLine {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
}

export function quoteEditorLines(mode: QuotePricingMode, lines: QuotePricingLine[], descriptions: string, scope: string): QuotePricingLine[] {
  if (mode === 'ITEMIZED') return lines;
  const details = descriptions.trim() ? descriptions : scope;
  return quoteDescriptionLines(details).map(description => ({ description, quantity: 1, unit: '', rate: 0 }));
}

export function quoteEditorError(input: {
  hasClient: boolean; title: string; mode: QuotePricingMode; lines: QuotePricingLine[];
  totalPrice: number | null; taxPercent: number | null;
}): string {
  if (!input.hasClient) return 'Select a client or enter a one-time client name.';
  if (!input.title.trim()) return 'Enter a quote title.';
  if (!input.lines.length) return input.mode === 'TOTAL_PRICE'
    ? 'Enter the Description (Scope of Work) or add work descriptions.'
    : 'Add at least one pricing item.';
  if (input.lines.length > 200) return 'A quote can contain up to 200 description lines.';
  for (const [index, line] of input.lines.entries()) {
    if (!line.description.trim()) return `Enter a description for item ${index + 1}.`;
    if (line.description.length > 4000) return `Shorten description ${index + 1} to 4000 characters or fewer.`;
    if (input.mode === 'ITEMIZED') {
      if (line.quantity == null || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) < .01) return `Enter a quantity of at least 0.01 for item ${index + 1}.`;
      if (line.rate == null || !Number.isFinite(Number(line.rate)) || Number(line.rate) < 0) return `Enter a valid rate for item ${index + 1}.`;
    }
  }
  if (input.mode === 'TOTAL_PRICE' && (input.totalPrice == null || !Number.isFinite(Number(input.totalPrice)) || Number(input.totalPrice) < 0)) return 'Enter a valid total price before tax.';
  if (input.mode === 'TOTAL_PRICE' && Number(input.totalPrice) > 9999999999.99) return 'The total price exceeds the supported maximum.';
  if (input.taxPercent == null || !Number.isFinite(Number(input.taxPercent)) || Number(input.taxPercent) < 0 || Number(input.taxPercent) > 100) return 'Enter an HST rate between 0 and 100%.';
  return '';
}

export function quotePricingSubtotal(
  mode: QuotePricingMode,
  lines: Array<{ quantity: number; rate: number }>,
  totalPrice: number,
): number {
  if (mode === "TOTAL_PRICE") return Number(totalPrice || 0);
  return lines.reduce(
    (sum, line) =>
      sum +
      Math.round(Number(line.quantity || 0) * Number(line.rate || 0) * 100) /
        100,
    0,
  );
}
