import { describe, expect, it } from 'vitest';
import {
  zoomAtPoint,
  computeFitScale,
  clamp,
  computeCenteredTransform,
} from '../../../../components/shared/MediaViewer/use-media-transform';

describe('clamp', () => {
  it("This feature is available in English only.", () => expect(clamp(5, 1, 10)).toBe(5));
  it("This feature is available in English only.", () => expect(clamp(-1, 1, 10)).toBe(1));
  it("This feature is available in English only.", () => expect(clamp(99, 1, 10)).toBe(10));
});

describe('computeFitScale', () => {
  it("This feature is available in English only.", () => {
    
    expect(computeFitScale({ w: 500, h: 400 }, { w: 1000, h: 800 })).toBeCloseTo(1.8);
  });
  it("This feature is available in English only.", () => {
    // viewport 800x600, natural 2000x1500, 0.9 * min(800/2000, 600/1500) = 0.9 * 0.4 = 0.36
    expect(computeFitScale({ w: 2000, h: 1500 }, { w: 800, h: 600 })).toBeCloseTo(0.36);
  });
  it("This feature is available in English only.", () => {
    expect(computeFitScale(null, { w: 800, h: 600 })).toBe(1);
  });
});

describe('zoomAtPoint', () => {
  it("This feature is available in English only.", () => {
    
    
    const next = zoomAtPoint(
      { scale: 1, offsetX: 100, offsetY: 100 },
      { x: 200, y: 200 },
      2, 
      { min: 0.1, max: 8 },
    );
    expect(next.scale).toBe(2);
    
    // viewport(200,200) = offsetX + imageCoord * newScale → 200 = offsetX + 100*2 → offsetX = 0
    expect(next.offsetX).toBeCloseTo(0);
    expect(next.offsetY).toBeCloseTo(0);
  });

  it("This feature is available in English only.", () => {
    const next = zoomAtPoint(
      { scale: 4, offsetX: 0, offsetY: 0 },
      { x: 100, y: 100 },
      4, 
      { min: 0.5, max: 8 },
    );
    expect(next.scale).toBe(8);
  });

  it("This feature is available in English only.", () => {
    const next = zoomAtPoint(
      { scale: 1, offsetX: 0, offsetY: 0 },
      { x: 0, y: 0 },
      0.01,
      { min: 0.5, max: 8 },
    );
    expect(next.scale).toBe(0.5);
  });
});

describe('computeCenteredTransform', () => {
  it("This feature is available in English only.", () => {
    const css = computeCenteredTransform(
      { scale: 1.8, offsetX: 10, offsetY: -5 },
      { w: 500, h: 400 },
      { w: 1000, h: 800 },
    );
    expect(css).toBe('translate(60px, 35px) scale(1.8)');
  });

  it("This feature is available in English only.", () => {
    const css = computeCenteredTransform(
      { scale: 1, offsetX: 12, offsetY: 24 },
      null,
      { w: 1000, h: 800 },
    );
    expect(css).toBe('translate(12px, 24px) scale(1)');
  });
});
