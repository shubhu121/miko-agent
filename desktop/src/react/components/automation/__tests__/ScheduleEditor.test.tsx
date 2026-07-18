// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScheduleEditor } from '../ScheduleEditor';
import { defaultScheduleDraft, type ScheduleDraft } from '../schedule-draft';

function Harness() {
  const [draft, setDraft] = useState<ScheduleDraft>({
    ...defaultScheduleDraft(),
    mode: 'daily',
    time: '12:00',
  });

  return <ScheduleEditor draft={draft} onChange={setDraft} />;
}

describe('ScheduleEditor', () => {
  beforeEach(() => {
    window.t = ((key: string) => {
      const translations: Record<string, string> = {
        'automation.field.schedule': "This feature is available in English only.",
        'automation.schedule.time': "This feature is available in English only.",
        'automation.schedule.hour': "This feature is available in English only.",
        'automation.schedule.minute': "This feature is available in English only.",
        'automation.schedule.mode.interval': "This feature is available in English only.",
        'automation.schedule.mode.daily': "This feature is available in English only.",
        'automation.schedule.mode.weekly': "This feature is available in English only.",
        'automation.schedule.mode.monthly': "This feature is available in English only.",
        'automation.schedule.mode.once': "This feature is available in English only.",
        'automation.schedule.mode.advanced': "This feature is available in English only.",
      };
      return translations[key] ?? key;
    }) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
  });

  it('uses the Miko time picker instead of the native time input', () => {
    const { container } = render(<Harness />);

    expect(container.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toHaveTextContent('12:00');
  });

  it('updates the draft from the custom hour and minute columns', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toHaveTextContent('13:05');
  });
});
