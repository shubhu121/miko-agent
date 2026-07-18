import { describe, expect, it } from 'vitest';
import {
  SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT,
  readScreenshotSegmentVisibleCharLimit,
  splitScreenshotMessages,
} from '../../utils/screenshot-segments';
import type { ChatMessage } from '../../stores/chat-types';

function user(id: string, text: string): ChatMessage {
  return { id, role: 'user', text };
}

function assistant(id: string, html: string): ChatMessage {
  return { id, role: 'assistant', blocks: [{ type: 'text', html }] };
}

describe('splitScreenshotMessages', () => {
  it('defaults to 10000 visible characters per screenshot page', () => {
    expect(SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT).toBe(10_000);
    expect(readScreenshotSegmentVisibleCharLimit({
      getItem: () => null,
    } as unknown as Storage)).toBe(10_000);
  });

  it('splits by visible character budget while keeping full conversation rounds together', () => {
    const messages = [
      user('u1', "This feature is available in English only.".repeat(4)),
      assistant('a1', "This feature is available in English only."),
      user('u2', "This feature is available in English only.".repeat(4)),
      assistant('a2', "This feature is available in English only."),
      user('u3', "This feature is available in English only.".repeat(4)),
      assistant('a3', "This feature is available in English only."),
    ];

    const chunks = splitScreenshotMessages(messages, 12);

    expect(chunks.map(chunk => chunk.map(message => message.id))).toEqual([
      ['u1', 'a1'],
      ['u2', 'a2'],
      ['u3', 'a3'],
    ]);
  });

  it('keeps an oversized single round intact instead of cutting through a reply', () => {
    const messages = [
      user('u1', "This feature is available in English only."),
      assistant('a1', "This feature is available in English only."),
      user('u2', "This feature is available in English only."),
      assistant('a2', "This feature is available in English only."),
    ];

    const chunks = splitScreenshotMessages(messages, 20);

    expect(chunks.map(chunk => chunk.map(message => message.id))).toEqual([
      ['u1', 'a1'],
      ['u2', 'a2'],
    ]);
  });

  it('counts ready voice-input transcriptions as visible screenshot text', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        attachments: [{
          path: '/tmp/voice.wav',
          name: 'voice.wav',
          isDir: false,
          mimeType: 'audio/wav',
          presentation: 'voice-input',
          transcription: {
            status: 'ready',
            text: "This feature is available in English only.".repeat(10),
          },
        }],
      },
      assistant('a1', "This feature is available in English only."),
      user('u2', "This feature is available in English only."),
    ];

    const chunks = splitScreenshotMessages(messages, 12);

    expect(chunks.map(chunk => chunk.map(message => message.id))).toEqual([
      ['u1', 'a1'],
      ['u2'],
    ]);
  });
});
