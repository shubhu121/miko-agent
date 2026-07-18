// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileOutputActions } from '../../components/chat/FileOutputActions';
import { takeMarkdownFileScreenshot } from '../../utils/screenshot';

vi.mock('../../utils/screenshot', () => ({
  takeMarkdownFileScreenshot: vi.fn(async () => undefined),
}));

describe('FileOutputActions screenshot share', () => {
  beforeEach(() => {
    window.t = ((key: string) => ({
      'desk.openWithDefault': "This feature is available in English only.",
      'chat.fileActions.more': "This feature is available in English only.",
      'chat.fileActions.revealInFinder': "This feature is available in English only.",
      'chat.fileActions.copyPath': "This feature is available in English only.",
      'chat.fileActions.downloadToDevice': "This feature is available in English only.",
      'common.screenshotShare': "This feature is available in English only.",
    }[key] || key)) as typeof window.t;
    window.platform = {
      openFile: vi.fn(),
      showInFinder: vi.fn(),
    } as unknown as typeof window.platform;
    vi.mocked(takeMarkdownFileScreenshot).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('adds screenshot share to Markdown file menus and invokes the article screenshot pipeline', () => {
    render(<FileOutputActions filePath="/tmp/session-files/a1b2c3" displayName="report.md" />);

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    fireEvent.click(screen.getByText("This feature is available in English only."));

    expect(takeMarkdownFileScreenshot).toHaveBeenCalledWith('/tmp/session-files/a1b2c3', {
      fileName: 'report.md',
    });
  });

  it('does not add screenshot share for non-Markdown files', () => {
    render(<FileOutputActions filePath="/tmp/archive.zip" displayName="archive.zip" />);

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
  });
});
