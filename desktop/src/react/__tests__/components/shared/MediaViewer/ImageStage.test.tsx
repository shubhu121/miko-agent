/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { ImageStage } from '../../../../components/shared/MediaViewer/ImageStage';
import type { FileRef } from '../../../../types/file-ref';

describe('ImageStage', () => {
  
  
  const file: FileRef = { id: '1', kind: 'image', source: 'desk', name: 'a.png', path: '/a.png', ext: 'png' };

  beforeEach(() => {
    (window as any).platform = {
      
      getFileUrl: vi.fn((p: string) => `file:///MOCK${p}`),
    };
  });
  afterEach(() => { cleanup(); delete (window as any).platform; });

  it("This feature is available in English only.", async () => {
    const { container } = render(<ImageStage file={file} viewport={{ width: 800, height: 600 }} />);
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img!.getAttribute('src')).toBe('file:///MOCK/a.png');
    });
    expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/a.png');
  });

  it("This feature is available in English only.", async () => {
    const { container } = render(<ImageStage file={file} viewport={{ width: 800, height: 600 }} />);
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBeTruthy();
    });
    const img = container.querySelector('img')!;
    
    Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 300, configurable: true });
    fireEvent.load(img);
    const stage = container.querySelector('[data-testid="image-stage"]')!;
    const before = (stage as HTMLElement).style.transform || '';

    fireEvent.wheel(stage, { deltaY: 0, clientX: 400, clientY: 300 });
    expect((stage as HTMLElement).style.transform || '').toBe(before);

    fireEvent.wheel(stage, { deltaY: -100, clientX: 400, clientY: 300 });
    await waitFor(() => expect((stage as HTMLElement).style.transform || '').not.toBe(before));

    const afterWheel = (stage as HTMLElement).style.transform || '';
    fireEvent.wheel(stage, { deltaY: -24, clientX: 400, clientY: 300, ctrlKey: true });
    await waitFor(() => expect((stage as HTMLElement).style.transform || '').not.toBe(afterWheel));
  });

  it("This feature is available in English only.", async () => {
    const { container } = render(<ImageStage file={file} viewport={{ width: 800, height: 600 }} />);
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBeTruthy();
    });

    const img = container.querySelector('img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 300, configurable: true });
    fireEvent.load(img);

    const stage = container.querySelector('[data-testid="image-stage"]') as HTMLElement;
    stage.setPointerCapture = vi.fn();
    stage.releasePointerCapture = vi.fn();
    stage.hasPointerCapture = vi.fn(() => true);

    fireEvent.wheel(stage, { deltaY: -100, clientX: 400, clientY: 300, altKey: true });
    const zoomed = stage.style.transform;

    fireEvent.pointerDown(stage, { pointerId: 1, button: 0, clientX: 120, clientY: 140 });
    expect(stage.style.cursor).toBe('grabbing');
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 150, clientY: 180 });
    expect(stage.style.transform).not.toBe(zoomed);

    fireEvent.pointerUp(stage, { pointerId: 1 });
    expect(stage.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(stage.style.cursor).toBe('grab');
  });

  it("This feature is available in English only.", async () => {
    const { container } = render(<ImageStage file={file} viewport={{ width: 1000, height: 800 }} />);
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBeTruthy();
    });
    const img = container.querySelector('img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 500, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true });
    fireEvent.load(img);
    // scale(1.8) = 0.9 * min(1000/500, 800/400) = 0.9 * 2
    await waitFor(() => {
      const t = (container.querySelector('[data-testid="image-stage"]') as HTMLElement).style.transform;
      expect(t).toBe('translate(50px, 40px) scale(1.8)');
    });
  });

  it("This feature is available in English only.", () => {
    delete (window as any).platform;
    const { getByTestId } = render(<ImageStage file={file} viewport={{ width: 800, height: 600 }} />);
    expect(getByTestId('image-stage-spinner')).toBeTruthy();
  });

  it("This feature is available in English only.", async () => {
    const prev: FileRef = { id: '0', kind: 'image', source: 'desk', name: 'prev.png', path: '/prev.png', ext: 'png' };
    const next: FileRef = { id: '2', kind: 'image', source: 'desk', name: 'next.png', path: '/next.png', ext: 'png' };
    render(
      <ImageStage
        file={file}
        viewport={{ width: 800, height: 600 }}
        neighbors={{ prev, next }}
      />,
    );
    await waitFor(() => {
      
      expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/a.png');
      expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/prev.png');
      expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/next.png');
    });
  });
});
