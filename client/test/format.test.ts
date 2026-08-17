import { describe, expect, it } from 'vitest';
import {
  formatRupees,
  formatPercent,
  countLabel,
  formatDate,
} from '../src/lib/format';

describe('formatRupees', () => {
  it('renders paise as whole rupees with the ₹ sign', () => {
    expect(formatRupees(123400)).toBe('₹1,234');
  });

  it('groups thousands the Indian way (lakh)', () => {
    expect(formatRupees(10000000)).toBe('₹1,00,000');
  });

  it('rounds fractional rupees away', () => {
    expect(formatRupees(150)).toBe('₹2');
    expect(formatRupees(0)).toBe('₹0');
  });
});

describe('formatPercent', () => {
  it('rounds a ratio to a whole percent', () => {
    expect(formatPercent(0.925)).toBe('93%');
    expect(formatPercent(0.8)).toBe('80%');
  });

  it('clamps values outside 0..1', () => {
    expect(formatPercent(1.4)).toBe('100%');
    expect(formatPercent(-0.2)).toBe('0%');
  });
});

describe('formatDate', () => {
  it('renders an ISO timestamp as a short date', () => {
    expect(formatDate('2026-08-02T10:00:00Z')).toBe('2 Aug 2026');
  });

  it('returns the input unchanged when it is not a valid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('countLabel', () => {
  it('uses the singular for exactly one', () => {
    expect(countLabel(1, 'photo')).toBe('1 photo');
  });

  it('uses the plural otherwise', () => {
    expect(countLabel(0, 'photo')).toBe('0 photos');
    expect(countLabel(3, 'photo')).toBe('3 photos');
  });

  it('accepts an explicit irregular plural', () => {
    expect(countLabel(2, 'entry', 'entries')).toBe('2 entries');
  });
});
