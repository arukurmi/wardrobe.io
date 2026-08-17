import { describe, expect, it } from 'vitest';
import { garmentSubtitle } from '../src/lib/garment';

describe('garmentSubtitle', () => {
  it('joins brand and color with a middot', () => {
    expect(garmentSubtitle({ brand: 'Levi', color: 'blue', category: 'bottom' })).toBe(
      'Levi · blue'
    );
  });

  it('shows whichever single field is present', () => {
    expect(garmentSubtitle({ brand: 'Nike', color: null, category: 'footwear' })).toBe(
      'Nike'
    );
    expect(garmentSubtitle({ brand: null, color: 'red', category: 'top' })).toBe('red');
  });

  it('falls back to the category when brand and color are missing', () => {
    expect(garmentSubtitle({ brand: null, color: null, category: 'dress' })).toBe('dress');
  });
});
