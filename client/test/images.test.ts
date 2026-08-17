import { describe, expect, it } from 'vitest';
import { ACCEPT_ATTR, ACCEPTED_IMAGE_TYPES, isAcceptedImage } from '../src/lib/images';

describe('accepted image types', () => {
  it('derives the accept attribute from the type list', () => {
    expect(ACCEPT_ATTR).toBe(ACCEPTED_IMAGE_TYPES.join(','));
    expect(ACCEPT_ATTR).toBe('image/jpeg,image/png,image/webp');
  });

  it('accepts known image types and rejects others', () => {
    expect(isAcceptedImage('image/png')).toBe(true);
    expect(isAcceptedImage('image/webp')).toBe(true);
    expect(isAcceptedImage('image/gif')).toBe(false);
    expect(isAcceptedImage('application/pdf')).toBe(false);
  });
});
