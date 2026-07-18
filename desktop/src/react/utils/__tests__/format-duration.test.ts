import { describe, it, expect } from 'vitest';
import { formatElapsed } from '../format-duration';

describe('formatElapsed', () => {
  it("This feature is available in English only.", () => expect(formatElapsed(5000)).toBe('5s'));
  it("This feature is available in English only.", () => expect(formatElapsed(0)).toBe('0s'));
  it("This feature is available in English only.", () => expect(formatElapsed(400)).toBe('0s'));
  it("This feature is available in English only.", () => expect(formatElapsed(65000)).toBe('1m5s'));
  it("This feature is available in English only.", () => expect(formatElapsed(120000)).toBe('2m0s'));
  it("This feature is available in English only.", () => expect(formatElapsed(-3000)).toBe('0s'));
});
