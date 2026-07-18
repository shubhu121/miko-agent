/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { FloatingInput } from '../../components/floating-input/FloatingInput';

function Harness({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <FloatingInput
      open
      anchorRect={{ left: 300, right: 500, top: 120, bottom: 180, width: 200, height: 60 }}
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      ariaLabel="floating input"
      submitLabel="This feature is available in English only."
    />
  );
}

describe('FloatingInput', () => {
  afterEach(() => cleanup());

  it('submits trimmed text with Enter', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    const input = screen.getByLabelText('floating input');
    fireEvent.change(input, { target: { value: "This feature is available in English only." } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith("This feature is available in English only.");
  });

  it('keeps Shift+Enter for multi-line input', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    const input = screen.getByLabelText('floating input');
    fireEvent.change(input, { target: { value: "This feature is available in English only." } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders an icon-only submit button with an accessible label', () => {
    render(<Harness onSubmit={vi.fn()} />);

    const button = screen.getByRole('button', { name: "This feature is available in English only." });
    expect(button.textContent?.trim()).toBe('');
  });
});
