// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../../stores';

vi.mock('../../../stores/chat-find-actions', () => ({
  runChatFind: vi.fn(),
  stepChatFind: vi.fn(),
}));

import { runChatFind, stepChatFind } from '../../../stores/chat-find-actions';
import { ChatFindBar } from '../../../components/chat/ChatFindBar';

const runChatFindMock = vi.mocked(runChatFind);
const stepChatFindMock = vi.mocked(stepChatFind);

const SESSION = '/chat/find-bar.jsonl';

describe('ChatFindBar', () => {
  beforeEach(() => {
    (window as unknown as { t: (path: string) => string }).t = (path: string) => path;
    runChatFindMock.mockClear();
    stepChatFindMock.mockClear();
    useStore.setState({
      currentSessionPath: SESSION,
      welcomeVisible: false,
      chatFindBySession: {},
      sessions: [],
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (window as unknown as { t?: unknown }).t;
  });

  it("This feature is available in English only.", () => {
    render(<ChatFindBar />);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();

    act(() => {
      useStore.getState().openChatFind(SESSION);
    });

    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it("This feature is available in English only.", () => {
    render(<ChatFindBar />);
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(useStore.getState().chatFindBySession[SESSION]?.open).toBe(true);
  });

  it("This feature is available in English only.", () => {
    useStore.setState({ welcomeVisible: true } as never);
    render(<ChatFindBar />);
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(useStore.getState().chatFindBySession[SESSION]).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    useStore.setState({ currentSessionPath: null } as never);
    render(<ChatFindBar />);
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("This feature is available in English only.", () => {
    
    
    const preConsume = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener('keydown', preConsume);
    render(<ChatFindBar />);
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useStore.getState().chatFindBySession[SESSION]).toBeUndefined();
    window.removeEventListener('keydown', preConsume);
  });

  it("This feature is available in English only.", () => {
    vi.useFakeTimers();
    act(() => {
      useStore.getState().openChatFind(SESSION);
    });
    render(<ChatFindBar />);
    const input = document.querySelector('[data-classic-find-input]') as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: 'a' } });
    expect(useStore.getState().chatFindBySession[SESSION].query).toBe('a');
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(useStore.getState().chatFindBySession[SESSION].query).toBe('abc');

    
    expect(runChatFindMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(runChatFindMock).toHaveBeenCalledTimes(1);
    expect(runChatFindMock).toHaveBeenCalledWith(SESSION, 'abc');
  });

  it("This feature is available in English only.", () => {
    act(() => {
      useStore.getState().openChatFind(SESSION, 'hi');
    });
    render(<ChatFindBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(stepChatFindMock).toHaveBeenCalledWith(SESSION, 1);

    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(stepChatFindMock).toHaveBeenCalledWith(SESSION, -1);
  });

  it("This feature is available in English only.", () => {
    act(() => {
      useStore.getState().openChatFind(SESSION, 'hi');
    });
    render(<ChatFindBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Close find' }));

    expect(useStore.getState().chatFindBySession[SESSION]).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    act(() => {
      useStore.getState().openChatFind(SESSION, 'hi');
    });
    render(<ChatFindBar />);
    const input = document.querySelector('[data-classic-find-input]') as HTMLInputElement;

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useStore.getState().chatFindBySession[SESSION]).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    act(() => {
      useStore.getState().openChatFind(SESSION, 'hello');
    });
    render(<ChatFindBar />);
    const input = document.querySelector('[data-classic-find-input]') as HTMLInputElement;
    input.blur();
    expect(document.activeElement).not.toBe(input);

    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('hello'.length);
    rafSpy.mockRestore();
  });

  it("This feature is available in English only.", () => {
    vi.useFakeTimers();
    act(() => {
      useStore.getState().openChatFind(SESSION);
    });
    render(<ChatFindBar />);
    const input = document.querySelector('[data-classic-find-input]') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'ghost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close find' }));
    expect(useStore.getState().chatFindBySession[SESSION]).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(runChatFindMock).not.toHaveBeenCalled();
    expect(useStore.getState().chatFindBySession[SESSION]).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    vi.useFakeTimers();
    act(() => {
      useStore.getState().openChatFind(SESSION);
    });
    render(<ChatFindBar />);
    const input = document.querySelector('[data-classic-find-input]') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));

    expect(runChatFindMock).toHaveBeenCalledTimes(1);
    expect(runChatFindMock).toHaveBeenCalledWith(SESSION, 'hi');
    expect(stepChatFindMock).not.toHaveBeenCalled();

    
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(runChatFindMock).toHaveBeenCalledTimes(1);

    
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(stepChatFindMock).toHaveBeenCalledWith(SESSION, 1);
  });

  it("This feature is available in English only.", () => {
    act(() => {
      useStore.getState().openChatFind(SESSION, 'hi');
      useStore.getState().setChatFindResults(SESSION, {
        matches: [
          { index: 1, exact: true, snippet: 'hi 1' },
          { index: 2, exact: true, snippet: 'hi 2' },
          { index: 3, exact: true, snippet: 'hi 3' },
        ],
        total: 3,
        tokens: ['hi'],
        truncated: false,
        bestIndex: null,
        revision: null,
      });
      useStore.getState().setChatFindActivePos(SESSION, 1);
    });
    render(<ChatFindBar />);

    expect(screen.getByText('2/3')).toBeInTheDocument();
  });
});
