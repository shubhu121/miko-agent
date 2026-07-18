import { describe, it, expect } from 'vitest';
import {
  parseMoodFromContent,
  parseUserAttachments,
  cleanMoodText,
  truncatePath,
  extractHostname,
  truncateHead,
  extractToolDetail,
  moodLabel,
} from '../../utils/message-parser';

describe('parseMoodFromContent', () => {
  it("This feature is available in English only.", () => {
    const result = parseMoodFromContent('hello world');
    expect(result.mood).toBeNull();
    expect(result.yuan).toBeNull();
    expect(result.text).toBe('hello world');
  });

  it("This feature is available in English only.", () => {
    const result = parseMoodFromContent('');
    expect(result.mood).toBeNull();
    expect(result.text).toBe('');
  });

  it("This feature is available in English only.", () => {
    const input = '<mood>feeling good</mood>\n\nSome text here.';
    const result = parseMoodFromContent(input);
    expect(result.mood).toBe('feeling good');
    expect(result.yuan).toBe('miko');
    expect(result.text).toBe('Some text here.');
  });

  it("This feature is available in English only.", () => {
    const input = '<pulse>energetic</pulse>\nContent.';
    const result = parseMoodFromContent(input);
    expect(result.mood).toBe('energetic');
    expect(result.yuan).toBe('butter');
  });

  it("This feature is available in English only.", () => {
    const input = '<reflect>pondering</reflect>\nContent.';
    const result = parseMoodFromContent(input);
    expect(result.mood).toBe('pondering');
    expect(result.yuan).toBe('ming');
  });

  it("This feature is available in English only.", () => {
    const input = '<mood>```\nline1\nline2\n```</mood>\nText.';
    const result = parseMoodFromContent(input);
    expect(result.mood).toBe('line1\nline2');
  });
});

describe('cleanMoodText', () => {
  it("This feature is available in English only.", () => {
    expect(cleanMoodText('```markdown\ncontent\n```')).toBe('content');
  });

  it("This feature is available in English only.", () => {
    expect(cleanMoodText('just text')).toBe('just text');
  });
});

describe('parseUserAttachments', () => {
  const reminder = [
    '[miko_reminder at 2026-07-10 09:05]',
    '- Current time: 2026-07-10 09:05',
    '[/miko_reminder]',
  ].join('\n');

  it("This feature is available in English only.", () => {
    const result = parseUserAttachments('hello');
    expect(result.text).toBe('hello');
    expect(result.files).toEqual([]);
    expect(result.deskContext).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const result = parseUserAttachments('');
    expect(result.text).toBe('');
    expect(result.files).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    const result = parseUserAttachments(`${reminder}\n\nhello`);
    expect(result.text).toBe('hello');
  });

  it("This feature is available in English only.", () => {
    const result = parseUserAttachments(reminder);
    expect(result.text).toBe('');
  });

  it("This feature is available in English only.", () => {
    const result = parseUserAttachments("This feature is available in English only.");
    expect(result.text).toBe("This feature is available in English only.");
    expect(result.attachedImages).toEqual([{ path: '/tmp/example.png', name: 'example.png' }]);
  });

  it("This feature is available in English only.", () => {
    const unclosed = '[miko_reminder at 2026-07-10 09:05]\n- Current time: 2026-07-10 09:05\nhello';
    const malformed = '[miko_reminder sometime]\nsecret\n[/miko_reminder]\nhello';
    expect(parseUserAttachments(unclosed).text).toBe(unclosed);
    expect(parseUserAttachments(malformed).text).toBe(malformed);
  });

  it("This feature is available in English only.", () => {
    const content = `hello\n\n${reminder}\n\nworld`;
    expect(parseUserAttachments(content).text).toBe(content);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    const result = parseUserAttachments(input);
    expect(result.text).toBe('Some text');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('/path/to/file.txt');
    expect(result.files[0].name).toBe('file.txt');
    expect(result.files[0].isDirectory).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    const result = parseUserAttachments(input);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].isDirectory).toBe(true);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    const result = parseUserAttachments(input);
    expect(result.text).toBe("This feature is available in English only.");
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('/Users/test/docs/note.md');
    expect(result.files[0].name).toBe('note.md');
    expect(result.files[0].isDirectory).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const input = [
      "This feature is available in English only.",
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
    ].join('\n');
    const result = parseUserAttachments(input);

    expect(result.text).toBe("This feature is available in English only.");
    expect(result.sessionFileRefs).toEqual([{
      fileId: 'sf_report',
      sessionPath: '/sessions/main.jsonl',
      label: "This feature is available in English only.",
      kind: 'attachment',
    }]);
    expect(result.files).toEqual([{
      path: "This feature is available in English only.",
      name: "This feature is available in English only.",
      isDirectory: false,
    }]);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    const result = parseUserAttachments(input);

    expect(result.text).toBe("This feature is available in English only.");
    expect(result.attachedImages).toEqual([
      {
        path: '/Users/test/.miko/attachments/upload-abc.png',
        name: 'upload-abc.png',
      },
    ]);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    const result = parseUserAttachments(input);
    expect(result.deskContext).not.toBeNull();
    expect(result.deskContext!.dir).toBe('/home/user/desk');
    expect(result.deskContext!.fileCount).toBe(2);
    expect(result.text).toBe('Some text');
  });
});

describe('truncatePath', () => {
  it("This feature is available in English only.", () => {
    expect(truncatePath('/short')).toBe('/short');
  });

  it("This feature is available in English only.", () => {
    const long = '/very/long/path/that/exceeds/thirty/five/chars/file.txt';
    const result = truncatePath(long);
    expect(result.startsWith('…')).toBe(true);
    expect(result.length).toBe(35);
  });

  it("This feature is available in English only.", () => {
    expect(truncatePath('')).toBe('');
  });
});

describe('extractHostname', () => {
  it("This feature is available in English only.", () => {
    expect(extractHostname('https://example.com/path')).toBe('example.com');
  });

  it("This feature is available in English only.", () => {
    expect(extractHostname('not-a-url')).toBe('not-a-url');
  });

  it("This feature is available in English only.", () => {
    expect(extractHostname('')).toBe('');
  });
});

describe('truncateHead', () => {
  it("This feature is available in English only.", () => {
    expect(truncateHead('short', 10)).toBe('short');
  });

  it("This feature is available in English only.", () => {
    expect(truncateHead('this is long text', 10)).toBe('this is l…');
  });
});

describe('extractToolDetail', () => {
  it("This feature is available in English only.", () => {
    const d = extractToolDetail('read', { file_path: '/a/b.txt' });
    expect(d.text).toContain('b.txt');
    expect(d.href).toBe('/a/b.txt');
    expect(d.hrefType).toBe('file');
  });

  it("This feature is available in English only.", () => {
    const d = extractToolDetail('bash', { command: 'ls -la' });
    expect(d.text).toBe('ls -la');
    expect(d.title).toBe('ls -la');
    expect(d.href).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    const d = extractToolDetail('exec_command', { cmd: 'npm test -- --runInBand' });
    expect(d.text).toBe('npm test -- --runInBand');
    expect(d.title).toBe('npm test -- --runInBand');
    expect(d.href).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    const command = 'rm -rf /Users/jason/.claude/plugins/marketplaces/temp_*';
    const d = extractToolDetail('bash', { command });

    expect(d.text).toBe('rm -rf /Users/jason/.claude/plugins/mar…');
    expect(d.title).toBe(command);
  });

  it("This feature is available in English only.", () => {
    const d = extractToolDetail('write_stdin', { process_id: 'term_1', chars: 'q\n' });
    expect(d.text).toBe('q\n');
    expect(d.title).toBe('q\n');
  });

  it("This feature is available in English only.", () => {
    const d = extractToolDetail('web_search', { query: 'test query' });
    expect(d.text).toBe('test query');
    expect(d.href).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    const d = extractToolDetail('web_fetch', { url: 'https://example.com/path' });
    expect(d.text).toBe('example.com');
    expect(d.href).toBe('https://example.com/path');
    expect(d.hrefType).toBe('url');
  });

  it("This feature is available in English only.", () => {
    expect(extractToolDetail('unknown_tool', { foo: 'bar' }).text).toBe('bar');
  });

  it("This feature is available in English only.", () => {
    expect(extractToolDetail('unknown_tool', { n: 42 }).text).toBe('');
  });

  it("This feature is available in English only.", () => {
    expect(extractToolDetail('read', undefined).text).toBe('');
  });
});

describe('moodLabel', () => {
  it("This feature is available in English only.", () => {
    expect(moodLabel('miko')).toContain('MOOD');
  });

  it("This feature is available in English only.", () => {
    expect(moodLabel('butter')).toContain('PULSE');
  });

  it("This feature is available in English only.", () => {
    expect(moodLabel('unknown')).toContain('MOOD');
  });
});
