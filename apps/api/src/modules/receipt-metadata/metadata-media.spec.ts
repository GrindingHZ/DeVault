import { describe, expect, it } from 'vitest';
import { computeIntakeHash, parseImageDataUrl, toImageDataUrl } from './metadata-media';

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('parseImageDataUrl', () => {
  it('reads the mime and decodes the bytes, and round trips', () => {
    const decoded = parseImageDataUrl(onePixelPng);
    expect(decoded?.mime).toBe('image/png');
    expect(decoded !== null && toImageDataUrl(decoded.mime, decoded.bytes)).toBe(onePixelPng);
  });

  it('rejects a string that is not an image data url', () => {
    expect(parseImageDataUrl('not-a-data-url')).toBeNull();
    expect(parseImageDataUrl('data:text/plain;base64,aGk=')).toBeNull();
  });
});

describe('computeIntakeHash', () => {
  it('is deterministic and changes with the name or the images', () => {
    const a = Buffer.from('a');
    const b = Buffer.from('b');
    const base = computeIntakeHash('watch', [a, b]);
    expect(base).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(computeIntakeHash('watch', [a, b])).toBe(base);
    expect(computeIntakeHash('ring', [a, b])).not.toBe(base);
    expect(computeIntakeHash('watch', [a])).not.toBe(base);
  });
});
