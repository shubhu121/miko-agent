/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useStore } from '../../../../stores';
import { MediaViewer } from '../../../../components/shared/MediaViewer/MediaViewer';
import type { FileRef } from '../../../../types/file-ref';

const f = (id: string, kind: FileRef['kind'] = 'image'): FileRef => ({
  id, kind, source: 'desk', name: `${id}.png`, path: `/${id}.png`, ext: 'png',
});

describe('MediaViewer interaction', () => {
  beforeEach(() => {
    window.t = ((key: string) => key) as typeof window.t;
    useStore.getState().closeMediaViewer();
    (window as any).platform = {
      readFileBase64: vi.fn(async () => 'BASE64'),
      getFileUrl: vi.fn((p: string) => `file://${p}`),
    };
  });
  afterEach(() => { cleanup(); useStore.getState().closeMediaViewer(); delete (window as any).platform; });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a'), f('b')], currentId: 'a', origin: 'desk' });
    render(<MediaViewer />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useStore.getState().mediaViewer).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { getByTestId } = render(<MediaViewer />);
    fireEvent.click(getByTestId('media-viewer-overlay'));
    expect(useStore.getState().mediaViewer).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { getByTestId } = render(<MediaViewer />);
    fireEvent.click(getByTestId('image-stage'));
    expect(useStore.getState().mediaViewer?.currentId).toBe('a');
    fireEvent.click(getByTestId('media-viewer-stage-wrap'));
    expect(useStore.getState().mediaViewer).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { getByTestId } = render(<MediaViewer />);
    fireEvent.click(getByTestId('media-viewer-close'));
    expect(useStore.getState().mediaViewer).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a'), f('b'), f('c')], currentId: 'a', origin: 'desk' });
    render(<MediaViewer />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useStore.getState().mediaViewer?.currentId).toBe('b');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a'), f('b')], currentId: 'b', origin: 'desk' });
    render(<MediaViewer />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(useStore.getState().mediaViewer?.currentId).toBe('a');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a'), f('b')], currentId: 'a', origin: 'desk' });
    render(<MediaViewer />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(useStore.getState().mediaViewer?.currentId).toBe('a');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a'), f('b')], currentId: 'b', origin: 'desk' });
    render(<MediaViewer />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useStore.getState().mediaViewer?.currentId).toBe('b');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { queryByTestId } = render(<MediaViewer />);
    expect(queryByTestId('media-viewer-prev')).toBeNull();
    expect(queryByTestId('media-viewer-next')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a'), f('b')], currentId: 'a', origin: 'desk' });
    const { getByTestId } = render(<MediaViewer />);
    expect(getByTestId('media-viewer-prev')).toBeTruthy();
    expect(getByTestId('media-viewer-next')).toBeTruthy();
  });

  it("This feature is available in English only.", () => {
    vi.useFakeTimers();
    try {
      useStore.getState().setMediaViewer({ files: [f('a'), f('b')], currentId: 'a', origin: 'desk' });
      const { getByTestId } = render(<MediaViewer />);
      const prev = getByTestId('media-viewer-prev');
      const next = getByTestId('media-viewer-next');
      act(() => {
        vi.advanceTimersByTime(2600);
      });
      expect(prev.className).not.toMatch(/hidden/);
      expect(next.className).not.toMatch(/hidden/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("This feature is available in English only.", async () => {
    useStore.getState().setMediaViewer({
      files: [{ ...f('v'), kind: 'video', ext: 'mp4' }],
      currentId: 'v', origin: 'desk',
    });
    const { getByTestId } = render(<MediaViewer />);
    await waitFor(() => expect(getByTestId('video-stage-video')).toBeTruthy());
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a'), f('b'), f('c')], currentId: 'b', origin: 'desk' });
    const { getByTestId } = render(<MediaViewer />);
    expect(getByTestId('media-viewer-index').textContent).toContain('2 / 3');
    const caption = getByTestId('media-viewer-caption');
    const name = getByTestId('media-viewer-name');
    expect(caption.contains(name)).toBe(true);
    expect(name.textContent).toContain('b.png');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { container } = render(<MediaViewer />);
    fireEvent.keyDown(window, { key: '=' });
    
    const stage = container.querySelector('[data-testid="image-stage"]') as HTMLElement;
    expect(stage.dataset.zoomInSeq).toBe('1');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { container } = render(<MediaViewer />);
    fireEvent.keyDown(window, { key: '-' });
    const stage = container.querySelector('[data-testid="image-stage"]') as HTMLElement;
    expect(stage.dataset.zoomOutSeq).toBe('1');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { container } = render(<MediaViewer />);
    fireEvent.keyDown(window, { key: '0' });
    const stage = container.querySelector('[data-testid="image-stage"]') as HTMLElement;
    expect(stage.dataset.resetSeq).toBe('1');
  });

  it("This feature is available in English only.", async () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { getByTestId } = render(<MediaViewer />);
    const stage = getByTestId('image-stage') as HTMLElement;
    const before = stage.style.transform;
    fireEvent.wheel(stage, {
      deltaY: -100,
      clientX: 120,
      clientY: 120,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
    });
    await waitFor(() => expect(stage.style.transform).not.toBe(before));
  });

  it("This feature is available in English only.", async () => {
    useStore.getState().setMediaViewer({ files: [f('a')], currentId: 'a', origin: 'desk' });
    const { getByTestId } = render(<MediaViewer />);
    const stage = getByTestId('image-stage') as HTMLElement;
    const before = stage.style.transform;
    fireEvent.wheel(stage, {
      deltaY: -24,
      clientX: 120,
      clientY: 120,
      altKey: false,
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
    });
    await waitFor(() => expect(stage.style.transform).not.toBe(before));
  });
});
