/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  CardShell,
  EmptyState,
  MikoThemeProvider,
  IconButton,
  List,
  Select,
  SettingRow,
  Switch,
  Textarea,
  TextInput,
} from '@miko/plugin-components';

describe('plugin component SDK', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders plugin surfaces that inherit Miko theme variables by default', () => {
    render(
      <MikoThemeProvider>
        <CardShell title="This feature is available in English only.">English-only content.</CardShell>
      </MikoThemeProvider>,
    );

    const root = screen.getByTestId('miko-plugin-theme');
    expect(root).toHaveClass('miko-plugin-theme');
    expect(root).toHaveAttribute('data-miko-theme-mode', 'inherit');
    expect(root).not.toHaveAttribute('data-miko-theme');
    expect(screen.getByText("This feature is available in English only.")).toHaveClass('miko-plugin-card-title');
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
  });

  it('applies named and custom theme tokens while leaving unspecified tokens to CSS fallback', () => {
    const { rerender } = render(
      <MikoThemeProvider mode="miko" theme="midnight">
        <span>named</span>
      </MikoThemeProvider>,
    );

    let root = screen.getByTestId('miko-plugin-theme');
    expect(root).toHaveAttribute('data-miko-theme-mode', 'miko');
    expect(root).toHaveAttribute('data-miko-theme', 'midnight');
    expect(root).toHaveStyle({
      '--miko-plugin-bg': '#3B4A54',
      '--miko-plugin-accent': '#C99AAF',
    });

    rerender(
      <MikoThemeProvider mode="custom" theme={{ bg: '#111111', accent: '#88AAFF' }}>
        <span>custom</span>
      </MikoThemeProvider>,
    );

    root = screen.getByTestId('miko-plugin-theme');
    expect(root).toHaveAttribute('data-miko-theme-mode', 'custom');
    expect(root).toHaveStyle({
      '--miko-plugin-bg': '#111111',
      '--miko-plugin-accent': '#88AAFF',
    });
    expect(root.style.getPropertyValue('--miko-plugin-text')).toBe('');
  });

  it('renders controlled controls with stable Miko component classes', () => {
    const onButtonClick = vi.fn();
    const onTextChange = vi.fn();
    const onSwitchChange = vi.fn();

    render(
      <>
        <Button variant="primary" iconLeft={<span data-testid="button-icon" />} onClick={onButtonClick}>
          English-only content.</Button>
        <IconButton label="This feature is available in English only." onClick={onButtonClick}>
          R
        </IconButton>
        <TextInput label="This feature is available in English only." value="miko" onChange={onTextChange} />
        <Textarea label="This feature is available in English only." value="notes" onChange={onTextChange} />
        <Switch checked={false} onChange={onSwitchChange} label="This feature is available in English only." />
      </>,
    );

    const button = screen.getByRole('button', { name: "This feature is available in English only." });
    expect(button).toHaveClass('miko-plugin-button', 'miko-plugin-button-primary');
    fireEvent.click(button);
    expect(onButtonClick).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toHaveClass('miko-plugin-icon-button');
    expect(screen.getByLabelText("This feature is available in English only.")).toHaveClass('miko-plugin-input');
    expect(screen.getByLabelText("This feature is available in English only.")).toHaveClass('miko-plugin-textarea');

    const toggle = screen.getByRole('switch', { name: "This feature is available in English only." });
    expect(toggle).toHaveClass('miko-plugin-switch');
    fireEvent.click(toggle);
    expect(onSwitchChange).toHaveBeenCalledWith(true);
  });

  it('uses a custom listbox select instead of native select', () => {
    const onChange = vi.fn();
    render(
      <Select
        label="This feature is available in English only."
        value="read"
        onChange={onChange}
        options={[
          { value: 'read', label: "This feature is available in English only." },
          { value: 'write', label: "This feature is available in English only." },
        ]}
      />,
    );

    expect(document.querySelector('select')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    expect(screen.getByRole('listbox', { name: "This feature is available in English only." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: "This feature is available in English only." }));

    expect(onChange).toHaveBeenCalledWith('write');
  });

  it('renders layout primitives for repeated plugin UI patterns', () => {
    render(
      <CardShell title="This feature is available in English only." footer={<Button size="sm">English-only content.</Button>}>
        <SettingRow label="This feature is available in English only." hint="This feature is available in English only." control={<Switch checked label="This feature is available in English only." />} />
        <List
          items={[
            { id: 'a', title: "This feature is available in English only.", meta: "This feature is available in English only." },
            { id: 'b', title: "This feature is available in English only.", description: "This feature is available in English only." },
          ]}
        />
        <EmptyState title="This feature is available in English only." description="This feature is available in English only." />
      </CardShell>,
    );

    expect(screen.getByText("This feature is available in English only.")).toHaveClass('miko-plugin-card-title');
    expect(screen.getByText("This feature is available in English only.")).toHaveClass('miko-plugin-setting-label');
    expect(screen.getByText("This feature is available in English only.")).toHaveClass('miko-plugin-list-title');
    expect(screen.getByText("This feature is available in English only.")).toHaveClass('miko-plugin-empty-title');
  });
});
