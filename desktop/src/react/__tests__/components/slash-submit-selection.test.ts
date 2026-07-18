import { beforeAll, describe, expect, it, vi } from 'vitest';

const t = (key: string) => key;

let buildSlashCommands: typeof import('../../components/input/slash-commands').buildSlashCommands;
let resolveSlashSubmitSelection: typeof import('../../components/input/slash-commands').resolveSlashSubmitSelection;
let XING_PROMPT: typeof import('../../components/input/slash-commands').XING_PROMPT;

beforeAll(async () => {
  vi.stubGlobal('window', { i18n: { locale: 'zh' } });
  ({ buildSlashCommands, resolveSlashSubmitSelection, XING_PROMPT } = await import('../../components/input/slash-commands'));
});

function makeCommands() {
  return buildSlashCommands(
    t,
    async () => {},
    async () => {},
    async () => {},
  );
}

describe('resolveSlashSubmitSelection', () => {
  it('keeps skill extraction focused on workflows instead of user profile memory', () => {
    expect(XING_PROMPT).toContain('extract reusable workflows');
    expect(XING_PROMPT).toContain("Do not write the user's personal profile");
    expect(XING_PROMPT).toContain('those belong in memory');
  });

  it('returns the matching slash command for an unfinished slash input', () => {
    const commands = makeCommands();

    const result = resolveSlashSubmitSelection({
      text: '/compa',
      skills: [],
      commands,
      selectedIndex: 0,
      dismissedText: null,
    });

    expect(result?.name).toBe('compact');
  });

  it('uses /learn while keeping /xing as a compatibility alias', () => {
    const commands = makeCommands();

    expect(resolveSlashSubmitSelection({
      text: '/learn', skills: [], commands, selectedIndex: 0, dismissedText: null,
    })?.name).toBe('learn');
    expect(resolveSlashSubmitSelection({
      text: '/xing', skills: [], commands, selectedIndex: 0, dismissedText: null,
    })?.name).toBe('learn');
  });

  it('does not auto-select when the current slash text was explicitly dismissed', () => {
    const commands = makeCommands();

    const result = resolveSlashSubmitSelection({
      text: '/compa',
      skills: [],
      commands,
      selectedIndex: 0,
      dismissedText: '/compa',
    });

    expect(result).toBeNull();
  });

  it('allows server slash commands to keep arguments on submit', () => {
    const commands = [
      ...makeCommands(),
      {
        name: 'plugin_hello',
        aliases: ['hello'],
        label: '/plugin_hello',
        description: 'plugin command',
        busyLabel: '',
        icon: '',
        type: 'server-command' as const,
        execute: vi.fn(),
      },
    ];

    const result = resolveSlashSubmitSelection({
      text: '/hello world',
      skills: [],
      commands,
      selectedIndex: 0,
      dismissedText: null,
    });

    expect(result?.name).toBe('plugin_hello');
  });

  it('does not treat builtin slash commands with arguments as local commands', () => {
    const commands = makeCommands();

    const result = resolveSlashSubmitSelection({
      text: '/compact now',
      skills: [],
      commands,
      selectedIndex: 0,
      dismissedText: null,
    });

    expect(result).toBeNull();
  });
});
