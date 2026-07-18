import { describe, expect, it } from 'vitest';
import { resolveLocateStep } from '../../../components/chat/locate-step';

describe('resolveLocateStep', () => {
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 5, elementPresent: true, itemPresent: true, oldestId: '3', hasMore: true, loadingMore: false, newestNumericId: 11 }))
      .toBe('scroll');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 1, elementPresent: false, itemPresent: false, oldestId: '10', hasMore: true, loadingMore: false, newestNumericId: 20 }))
      .toBe('load-more');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 1, elementPresent: false, itemPresent: false, oldestId: '10', hasMore: true, loadingMore: true, newestNumericId: 20 }))
      .toBe('wait');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 1, elementPresent: false, itemPresent: false, oldestId: '10', hasMore: false, loadingMore: false, newestNumericId: 20 }))
      .toBe('give-up');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 12, elementPresent: false, itemPresent: false, oldestId: '10', hasMore: false, loadingMore: false, newestNumericId: 20 }))
      .toBe('give-up');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 12, elementPresent: false, itemPresent: true, oldestId: '10', hasMore: false, loadingMore: false, newestNumericId: 20 }))
      .toBe('wait-element');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 12, elementPresent: false, itemPresent: true, oldestId: '10', hasMore: true, loadingMore: true, newestNumericId: 20 }))
      .toBe('wait-element');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 12, elementPresent: false, itemPresent: false, oldestId: '10', hasMore: false, loadingMore: false, newestNumericId: 11 }))
      .toBe('refresh');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 0, elementPresent: false, itemPresent: false, oldestId: 'stream-a1', hasMore: false, loadingMore: false, newestNumericId: null }))
      .toBe('refresh');
  });
  it("This feature is available in English only.", () => {
    expect(resolveLocateStep({ targetIndex: 5, elementPresent: false, itemPresent: false, oldestId: 'stream-a1', hasMore: false, loadingMore: false, newestNumericId: 8 }))
      .toBe('refresh');
  });
});
