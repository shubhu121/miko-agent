// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatTranscript } from '../../components/chat/ChatTranscript';
import { useStore } from '../../stores';
import type { ChatListItem, ContentBlock, ToolCall } from '../../stores/chat-types';

const sessionPath = '/session/process-fold.jsonl';

function t(key: string, vars?: Record<string, string | number>): string {
  const table: Record<string, string> = {
    'thinking.done': "This feature is available in English only.",
    'thinking.active': "This feature is available in English only.",
    'toolGroup.count': "This feature is available in English only.",
    'toolGroup.countWithFail': "This feature is available in English only.",
    'toolGroup.running': "This feature is available in English only.",
    'tool._fallback.done': "This feature is available in English only.",
    'tool._fallback.running': "This feature is available in English only.",
    'processFold.summary': "This feature is available in English only.",
    'processFold.tools': "This feature is available in English only.",
    'processFold.thinking': "This feature is available in English only.",
    'processFold.unsuccessful': "This feature is available in English only.",
  };
  return (table[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? ''));
}

function user(id: string): ChatListItem {
  return { type: 'message', data: { id, role: 'user', text: "This feature is available in English only." } };
}

function assistant(id: string, blocks: ContentBlock[]): ChatListItem {
  return { type: 'message', data: { id, role: 'assistant', blocks } };
}

function thinking(content = "This feature is available in English only."): ContentBlock {
  return { type: 'thinking', content, sealed: true };
}

function tool(name: string, success = true): ToolCall {
  return { name, args: { command: name }, done: true, success };
}

function toolGroup(tools: ToolCall[]): ContentBlock {
  return { type: 'tool_group', tools, collapsed: false };
}

function textBlock(html: string, source: string): ContentBlock {
  return { type: 'text', html, source };
}

describe('ProcessFoldBlock', () => {
  beforeEach(() => {
    window.t = t as typeof window.t;
    useStore.setState({
      agents: [],
      agentName: "This feature is available in English only.",
      agentYuan: 'miko',
      streamingSessions: [],
      selectedIdsBySession: {},
      chatSessions: {
        [sessionPath]: {
          hasMore: false,
          loadingMore: false,
          items: [],
        },
      },
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('collapses process-only assistant runs and expands original blocks in place', () => {
    const items: ChatListItem[] = [
      user('u1'),
      assistant('a1', [
        thinking("This feature is available in English only."),
        textBlock("This feature is available in English only.", "This feature is available in English only."),
        toolGroup([tool('npm test')]),
      ]),
      assistant('a2', [
        thinking("This feature is available in English only."),
        textBlock("This feature is available in English only.", "This feature is available in English only."),
        toolGroup([tool('read'), tool('write', false)]),
      ]),
      assistant('a3', [
        thinking("This feature is available in English only."),
        textBlock("This feature is available in English only.", "This feature is available in English only."),
        toolGroup([tool('verify')]),
      ]),
      assistant('a4', [
        thinking("This feature is available in English only."),
        { type: 'mood', yuan: 'butter', text: 'PULSE' },
        { type: 'text', html: "This feature is available in English only." },
      ]),
    ];

    render(
      <ChatTranscript
        items={items}
        sessionPath={sessionPath}
        enableProcessFold
      />,
    );

    const summary = screen.getByRole('button', {
      name: "This feature is available in English only.",
    });
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(screen.queryByText('npm test')).not.toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getAllByText("This feature is available in English only.")).toHaveLength(1);
    expect(screen.getByText(/PULSE/)).toBeInTheDocument();

    fireEvent.click(summary);

    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getAllByText("This feature is available in English only.")).toHaveLength(4);
  });

  it('keeps the process-fold Collapse shell full width inside the assistant flex column', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'desktop/src/react/components/chat/ProcessFoldBlock.tsx'),
      'utf8',
    );
    const css = fs.readFileSync(
      path.join(process.cwd(), 'desktop/src/react/components/chat/Chat.module.css'),
      'utf8',
    );
    const processFoldCollapseRule = css.match(/\.processFoldCollapse\s*\{(?<body>[^}]*)\}/)?.groups?.body || '';

    expect(source).toContain('className={styles.processFoldCollapse}');
    expect(processFoldCollapseRule).toContain('width: 100%');
    expect(processFoldCollapseRule).toContain('box-sizing: border-box');
  });
});
