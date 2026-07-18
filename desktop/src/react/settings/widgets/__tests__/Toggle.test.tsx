
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Toggle } from '../Toggle';

afterEach(cleanup);

describe('Toggle', () => {
  it('renders on state when on=true', () => {
    const { container } = render(<Toggle on={true} onChange={() => {}} />);
    const btn = container.querySelector('button.miko-toggle');
    expect(btn).not.toBeNull();
    expect(btn?.classList.contains('on')).toBe(true);
    expect(btn?.classList.contains('loading')).toBe(false);
    expect(btn?.getAttribute('aria-checked')).toBe('true');
    expect(btn?.getAttribute('aria-busy')).toBeNull();
    expect((btn as HTMLButtonElement)?.disabled).toBe(false);
  });

  it('renders off state when on=false', () => {
    const { container } = render(<Toggle on={false} onChange={() => {}} />);
    const btn = container.querySelector('button.miko-toggle');
    expect(btn?.classList.contains('on')).toBe(false);
    expect(btn?.classList.contains('loading')).toBe(false);
    expect(btn?.getAttribute('aria-checked')).toBe('false');
  });

  it('renders loading state when on=undefined', () => {
    const { container } = render(<Toggle on={undefined} onChange={() => {}} />);
    const btn = container.querySelector('button.miko-toggle');
    expect(btn?.classList.contains('loading')).toBe(true);
    expect(btn?.classList.contains('on')).toBe(false);
    expect(btn?.getAttribute('aria-busy')).toBe('true');
    expect(btn?.getAttribute('aria-checked')).toBe('mixed');
    expect((btn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('does not fire onChange when clicked in loading state', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle on={undefined} onChange={onChange} />);
    const btn = container.querySelector('button.miko-toggle') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onChange with toggled value when on=true', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle on={true} onChange={onChange} />);
    fireEvent.click(container.querySelector('button.miko-toggle')!);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('fires onChange with toggled value when on=false', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle on={false} onChange={onChange} />);
    fireEvent.click(container.querySelector('button.miko-toggle')!);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('respects external disabled prop', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle on={true} onChange={onChange} disabled />);
    const btn = container.querySelector('button.miko-toggle') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
  });
});
