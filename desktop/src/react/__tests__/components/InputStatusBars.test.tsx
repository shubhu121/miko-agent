// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InputStatusBars } from '../../components/input/InputStatusBars';

describe('InputStatusBars', () => {
  it('shows an indeterminate screenshot progress bar above the chat input', () => {
    render(
      <InputStatusBars
        slashBusy={null}
        slashBusyLabel="This feature is available in English only."
        compacting={false}
        compactingLabel="This feature is available in English only."
        screenshotBusy
        screenshotLabel="This feature is available in English only."
        screenshotPageLabel="This feature is available in English only."
        screenshotProgress={{
          completedBlocks: 12,
          totalBlocks: 37,
          currentPage: 2,
          totalPages: 4,
        }}
        inlineError={null}
        slashResult={null}
        onResultClick={undefined}
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: "This feature is available in English only." });
    expect(progress).toHaveAttribute('aria-valuenow', '12');
    expect(progress).toHaveAttribute('aria-valuemax', '37');
  });
});
