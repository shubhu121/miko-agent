/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { chapterRailHoverHit } from '../../components/PreviewPanel';

const RECT = { top: 100, right: 500, height: 400 };

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    
    expect(chapterRailHoverHit(RECT, 470, 200)).toBe(true);
  });

  it("This feature is available in English only.", () => {
    
    expect(chapterRailHoverHit(RECT, 100, 200)).toBe(false);
  });

  it("This feature is available in English only.", () => {
    expect(chapterRailHoverHit(RECT, 430, 200)).toBe(false);
  });

  it("This feature is available in English only.", () => {
    expect(chapterRailHoverHit(RECT, 510, 200)).toBe(false);
  });

  it("This feature is available in English only.", () => {
    
    expect(chapterRailHoverHit(RECT, 470, 500)).toBe(false);
  });
});
