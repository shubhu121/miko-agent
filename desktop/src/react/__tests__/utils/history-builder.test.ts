import { describe, expect, it } from 'vitest';
import { buildItemsFromHistory } from '../../utils/history-builder';

describe('buildItemsFromHistory user image restoration', () => {
  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: 'hello',
        timestamp: '2026-05-07T05:42:00.000Z',
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.timestamp).toBe(Date.parse('2026-05-07T05:42:00.000Z'));
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: '0',
        entryId: 'entry-user-1',
        role: 'user',
        content: 'hello',
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.id).toBe('0');
    expect(first.data.sourceEntryId).toBe('entry-user-1');
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: '<t>05-13 05:03</t> hello from phone',
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe('hello from phone');
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: "This feature is available in English only.",
        },
        {
          id: 'u2',
          role: 'user',
          content: '(Interjection, no MOOD needed)\njust answer directly',
        },
      ],
    });

    const first = items[0];
    const second = items[1];
    expect(first.type).toBe('message');
    expect(second.type).toBe('message');
    if (first.type !== 'message' || second.type !== 'message') throw new Error('expected messages');
    expect(first.data.text).toBe("This feature is available in English only.");
    expect(second.data.text).toBe('just answer directly');
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: "This feature is available in English only.",
      }],
    });

    expect(items).toHaveLength(1);
    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe('');
    expect(first.data.textHtml).toBeUndefined();
    expect(first.data.attachments).toEqual([{
      path: '/Users/test/.miko/attachments/upload-abc.png',
      name: 'upload-abc.png',
      isDir: false,
    }]);
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: "This feature is available in English only.",
        images: [{ data: 'BASE64', mimeType: 'image/png' }],
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe("This feature is available in English only.");
    expect(first.data.attachments).toEqual([{
      path: '/Users/test/.miko/attachments/upload-native.png',
      name: 'upload-native.png',
      isDir: false,
      mimeType: 'image/png',
    }]);
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: "This feature is available in English only.",
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe("This feature is available in English only.");
    expect(first.data.textHtml).not.toContain('attached_audio');
    expect(first.data.attachments).toEqual([{
      path: '/Users/test/.miko/session-files/voice.wav',
      name: 'voice.wav',
      isDir: false,
    }]);
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: "This feature is available in English only.",
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe('');
    expect(first.data.textHtml).toBeUndefined();
    expect(first.data.attachments).toEqual([{
      path: '/Users/test/.miko/session-files/voice.wav',
      name: 'voice.wav',
      isDir: false,
    }]);
  });

  it("This feature is available in English only.", () => {
    const filePath = "This feature is available in English only.";
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: `[attached_audio: ${filePath}]`,
      }],
      sessionFiles: [{
        fileId: 'sf_voice_1',
        filePath,
        realPath: filePath,
        displayName: "This feature is available in English only.",
        label: "This feature is available in English only.",
        filename: "This feature is available in English only.",
        mime: 'audio/wav',
        kind: 'audio',
        status: 'available',
        missingAt: null,
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe('');
    expect(first.data.textHtml).toBeUndefined();
    expect(first.data.attachments).toEqual([{
      fileId: 'sf_voice_1',
      path: filePath,
      name: "This feature is available in English only.",
      isDir: false,
      mimeType: 'audio/wav',
      status: 'available',
      missingAt: null,
    }]);
  });

  it("This feature is available in English only.", () => {
    const filePath = "This feature is available in English only.";
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u-voice-input',
        role: 'user',
        content: "This feature is available in English only.",
      }],
      sessionFiles: [{
        fileId: 'sf_voice_1',
        filePath,
        displayName: "This feature is available in English only.",
        mime: 'audio/wav',
        kind: 'audio',
        presentation: 'voice-input',
        listed: false,
        status: 'available',
        missingAt: null,
      }],
    });

    const first = items[0];
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe('');
    expect(first.data.attachments).toEqual([{
      fileId: 'sf_voice_1',
      path: filePath,
      name: "This feature is available in English only.",
      isDir: false,
      mimeType: 'audio/wav',
      presentation: 'voice-input',
      listed: false,
      status: 'available',
      missingAt: null,
    }]);
  });

  it("This feature is available in English only.", () => {
    const filePath = "This feature is available in English only.";
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u-voice-transcript',
        role: 'user',
        content: "This feature is available in English only.",
      }],
      sessionFiles: [{
        fileId: 'sf_voice_1',
        filePath,
        displayName: "This feature is available in English only.",
        mime: 'audio/wav',
        kind: 'audio',
        presentation: 'voice-input',
        listed: false,
        waveform: {
          version: 1,
          peaks: [0.1, 0.4, 0.8],
          durationMs: 1800,
          source: 'computed',
        },
        transcription: {
          status: 'ready',
          text: "This feature is available in English only.",
          providerId: 'mimo',
          modelId: 'mimo-v2.5-asr',
          protocolId: 'mimo-chat-completions-asr',
        },
      }],
    } as any);

    const first = items[0];
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe('');
    expect(first.data.textHtml).toBeUndefined();
    expect(first.data.attachments?.[0]).toMatchObject({
      fileId: 'sf_voice_1',
      presentation: 'voice-input',
      waveform: {
        version: 1,
        peaks: [0.1, 0.4, 0.8],
        durationMs: 1800,
        source: 'computed',
      },
      transcription: {
        status: 'ready',
        text: "This feature is available in English only.",
        providerId: 'mimo',
        modelId: 'mimo-v2.5-asr',
      },
    });
  });

  it("This feature is available in English only.", () => {
    const filePath = "This feature is available in English only.";
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u1',
        role: 'user',
        content: "This feature is available in English only.",
      }],
      sessionFiles: [{
        fileId: 'sf_image_1',
        filePath,
        realPath: filePath,
        displayName: "This feature is available in English only.",
        label: "This feature is available in English only.",
        filename: "This feature is available in English only.",
        mime: 'image/png',
        kind: 'image',
        status: 'available',
        missingAt: null,
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe('');
    expect(first.data.textHtml).toBeUndefined();
    expect(first.data.attachments).toEqual([{
      fileId: 'sf_image_1',
      path: filePath,
      name: "This feature is available in English only.",
      isDir: false,
      mimeType: 'image/png',
      status: 'available',
      missingAt: null,
    }]);
  });

  it("This feature is available in English only.", () => {
    const filePath = "This feature is available in English only.";
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u-session-file',
        role: 'user',
        content: [
          "This feature is available in English only.",
          "This feature is available in English only.",
          '',
          "This feature is available in English only.",
        ].join('\n'),
      }],
      sessionFiles: [{
        fileId: 'sf_report',
        filePath,
        realPath: filePath,
        displayName: "This feature is available in English only.",
        label: "This feature is available in English only.",
        filename: "This feature is available in English only.",
        mime: 'text/plain',
        kind: 'attachment',
        status: 'available',
        missingAt: null,
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.text).toBe("This feature is available in English only.");
    expect(first.data.textHtml).not.toContain('SessionFile');
    expect(first.data.attachments).toEqual([{
      fileId: 'sf_report',
      path: filePath,
      name: "This feature is available in English only.",
      isDir: false,
      mimeType: 'text/plain',
      status: 'available',
      missingAt: null,
    }]);
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'a1',
        role: 'assistant',
        content: "This feature is available in English only.",
      }],
      blocks: [
        { type: 'file', afterIndex: 0, label: 'missing-path.png', ext: 'png' },
        { type: 'plugin_card', afterIndex: 0 },
        { type: 'cron_confirm', afterIndex: 0, status: 'approved' },
        { type: 'file', afterIndex: 0, filePath: '/tmp/report.pdf', label: 'report.pdf', ext: 'pdf' },
      ],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.blocks?.map(block => block.type)).toEqual(['text', 'file']);
    expect(first.data.blocks?.[1]).toMatchObject({
      type: 'file',
      filePath: '/tmp/report.pdf',
      label: 'report.pdf',
      ext: 'pdf',
    });
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'a-chat-surface',
        role: 'assistant',
        content: "This feature is available in English only.",
      }],
      blocks: [{
        type: 'plugin_card',
        afterIndex: 0,
        card: {
          type: 'chat.surface',
          pluginId: 'tavern',
          sessionRef: {
            sessionId: 'sess_tavern',
            sessionPath: '/sessions/tavern.jsonl',
          },
          title: 'Tavern run',
          description: 'Private transcript',
        },
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.blocks?.at(-1)).toMatchObject({
      type: 'plugin_card',
      card: {
        type: 'chat.surface',
        pluginId: 'tavern',
        sessionId: 'sess_tavern',
        sessionPath: '/sessions/tavern.jsonl',
        sessionRef: {
          sessionId: 'sess_tavern',
          sessionPath: '/sessions/tavern.jsonl',
        },
      },
    });
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'a-empty-thinking',
        role: 'assistant',
        content: '',
        thinking: '',
      }],
    });

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.blocks).toEqual([{
      type: 'thinking',
      content: '',
      sealed: true,
    }]);
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'a1',
        role: 'assistant',
        content: "This feature is available in English only.",
      }],
      blocks: [{
        type: 'interlude',
        afterIndex: 0,
        id: 'deferred:subagent-1:success',
        variant: 'deferred_result',
        taskId: 'subagent-1',
        status: 'success',
        sourceKind: 'subagent',
        sourceLabel: "This feature is available in English only.",
        text: "This feature is available in English only.",
        detailMarkdown: "This feature is available in English only.",
      }],
    });

    const first = items[0];
    const second = items[1];
    expect(items).toHaveLength(2);
    expect(first.type).toBe('message');
    expect(second.type).toBe('interlude');
    if (first.type !== 'message' || second.type !== 'interlude') {
      throw new Error('expected assistant message followed by interlude item');
    }
    expect(first.data.blocks?.map(block => block.type)).toEqual(['text']);
    expect(second.data).toMatchObject({
      type: 'interlude',
      taskId: 'subagent-1',
      text: "This feature is available in English only.",
    });
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'a1',
        role: 'assistant',
        content: "This feature is available in English only.",
      }],
      blocks: [
        {
          type: 'interlude',
          afterIndex: 0,
          id: 'deferred:task-img:success',
          variant: 'deferred_result',
          timelinePlacement: 'after_anchor_message',
          taskId: 'task-img',
          status: 'success',
          sourceKind: 'tool',
          sourceLabel: "This feature is available in English only.",
          text: "This feature is available in English only.",
        },
        {
          type: 'file',
          afterIndex: 0,
          replacesTaskId: 'task-img',
          filePath: '/tmp/image.png',
          label: 'image.png',
          ext: 'png',
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual(['message', 'interlude']);
    expect(items[0]?.type).toBe('message');
    if (items[0]?.type !== 'message') throw new Error('expected message');
    expect(items[0].data.blocks?.map((block) => block.type)).toEqual(['text', 'file']);
    expect(items[1]?.type).toBe('interlude');
    if (items[1]?.type !== 'interlude') throw new Error('expected interlude');
    expect(items[1].data.taskId).toBe('task-img');
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [
        {
          id: 'a-media',
          sourceIndex: 10,
          role: 'assistant',
          content: "This feature is available in English only.",
        },
        {
          id: 'a-final',
          sourceIndex: 20,
          role: 'assistant',
          content: "This feature is available in English only.",
        },
        {
          id: 'a-ack',
          sourceIndex: 22,
          role: 'assistant',
          content: "This feature is available in English only.",
        },
      ],
      blocks: [
        {
          type: 'file',
          afterIndex: 0,
          sourceIndex: 12,
          replacesTaskId: 'task-img',
          filePath: '/tmp/generated.png',
          label: 'generated.png',
          ext: 'png',
        },
        {
          type: 'interlude',
          afterIndex: 0,
          sourceIndex: 21,
          id: 'deferred:subagent-1:success:delivery-1',
          deliveryId: 'delivery-1',
          variant: 'deferred_result',
          timelinePlacement: 'after_anchor_message',
          taskId: 'subagent-1',
          status: 'success',
          sourceKind: 'subagent',
          text: "This feature is available in English only.",
        },
      ],
    });

    expect(items.map((item) => (item.type === 'message' ? item.data.id : item.id))).toEqual([
      'a-media',
      'a-final',
      'deferred:subagent-1:success:delivery-1',
      'a-ack',
    ]);
    const mediaMessage = items[0];
    expect(mediaMessage?.type).toBe('message');
    if (mediaMessage?.type !== 'message') throw new Error('expected message');
    expect(mediaMessage.data.blocks?.map((block) => block.type)).toEqual(['text', 'file']);
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'a1',
        role: 'assistant',
        content: '',
      }],
      blocks: [{
        type: 'interlude',
        afterIndex: 0,
        id: 'deferred:subagent-2:success',
        variant: 'deferred_result',
        taskId: 'subagent-2',
        status: 'success',
        sourceKind: 'subagent',
        text: "This feature is available in English only.",
      }],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe('interlude');
    if (items[0]?.type !== 'interlude') throw new Error('expected interlude item');
    expect(items[0].data.text).toBe("This feature is available in English only.");
  });

  it('restores a clean user message plus the independent Agent review card', () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: 'u-review',
        role: 'user',
        content: 'internal expanded prompt with review',
        displayText: 'Please inspect this @Critic',
        agentReview: {
          requestId: 'review-1',
          status: 'completed',
          reviewedSessionId: 'sess_parent',
          reviewerSessionId: 'sess_review',
          reviewerAgentId: 'critic',
          reviewerAgentName: 'Critic',
          text: 'Independent findings',
        },
      }],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe('message');
    if (items[0]?.type !== 'message') throw new Error('expected message');
    expect(items[0].data.text).toBe('Please inspect this @Critic');
    expect(items[0].data.agentReview).toMatchObject({
      reviewerSessionId: 'sess_review',
      text: 'Independent findings',
    });
  });
});
