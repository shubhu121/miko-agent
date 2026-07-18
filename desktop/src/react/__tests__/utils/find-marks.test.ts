/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { applyFindMarks, clearFindMarks } from '../../utils/find-marks';

describe('find-marks', () => {
  it("This feature is available in English only.", () => {
    const root = document.createElement('div');
    root.innerHTML = "This feature is available in English only.";
    const marks = applyFindMarks(root, ['hello', "This feature is available in English only."], 'chat-find-mark');
    expect(marks.length).toBe(2);
    expect(root.querySelectorAll('mark.chat-find-mark').length).toBe(2);
    expect(root.textContent).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Hello HELLO hello</p>';
    const marks = applyFindMarks(root, ['hello'], 'x-mark');
    expect(marks.length).toBe(3);
    expect(marks[0].textContent).toBe('Hello');
  });

  it("This feature is available in English only.", () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>abc def</p>';
    applyFindMarks(root, ['abc'], 'x-mark');
    clearFindMarks(root, 'x-mark');
    expect(root.querySelectorAll('mark').length).toBe(0);
    expect(root.innerHTML).toBe('<p>abc def</p>');
  });

  it("This feature is available in English only.", () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>abc</p>';
    applyFindMarks(root, ['abc'], 'x-mark');
    applyFindMarks(root, ['ab'], 'x-mark');
    expect(root.querySelectorAll('mark.x-mark').length).toBe(1);
    expect(root.querySelector('mark.x-mark')!.textContent).toBe('ab');
  });

  it("This feature is available in English only.", () => {
    const root = document.createElement('div');
    root.innerHTML = "This feature is available in English only.";
    const marks = applyFindMarks(root, ['session', 'session_search'], 'x-mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('session_search');
  });

  it("This feature is available in English only.", () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>outside abc</p><div data-find-markable=""><p>inside abc</p></div>';
    const marks = applyFindMarks(root, ['abc'], 'x-mark', { scopeSelector: '[data-find-markable]' });
    expect(marks.length).toBe(1);
    expect(marks[0].closest('[data-find-markable]')).not.toBeNull();
    expect(root.querySelector('p')!.querySelector('mark')).toBeNull();
    expect(root.textContent).toBe('outside abcinside abc');
  });

  it("This feature is available in English only.", () => {
    expect(applyFindMarks(null, ['a'], 'x')).toEqual([]);
    const root = document.createElement('div');
    root.innerHTML = '<p>abc</p>';
    expect(applyFindMarks(root, [], 'x')).toEqual([]);
    expect(() => clearFindMarks(null, 'x')).not.toThrow();
  });
});
