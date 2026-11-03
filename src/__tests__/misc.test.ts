// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { prepareDoc } from '../components/DocFrame';
import { parseConfig } from '../config';
import { buildFolderIndex } from '../lib/data';
import { olderThan, timeAgo } from '../lib/format';
import { DEFAULT_MESSAGES, format } from '../messages';
const base = { googleClientId: 'id', sharedDriveId: 'd' };

describe('parseConfig', () => {
  it('requires the Google settings', () => {
    expect(() => parseConfig({ appName: 'X' })).toThrow(/googleClientId/);
    expect(() => parseConfig({ googleClientId: 'id' })).toThrow(/exactly one/);
    expect(() => parseConfig({ ...base, rootFolderId: 'f' })).toThrow(/exactly one/);
  });

  it('accepts a Shared Drive or a folder as the root', () => {
    expect(parseConfig(base).root).toEqual({ kind: 'drive', id: 'd' });
    expect(parseConfig({ googleClientId: 'id', rootFolderId: 'f' }).root).toEqual({ kind: 'folder', id: 'f' });
  });

  it('applies defaults and normalises values', () => {
    const config = parseConfig({ ...base, googleClientId: ' id ', allowedDomain: 'Example.COM' });
    expect(config).toMatchObject({ appName: DEFAULT_MESSAGES.defaultAppName, googleClientId: 'id', allowedDomain: 'example.com', theme: {} });
    expect(config.messages).toEqual(DEFAULT_MESSAGES);
    expect(config.editing).toBe(false);
    expect(parseConfig({ ...base, editing: true, templatesFolderId: ' t ' })).toMatchObject({ editing: true, templatesFolderId: 't' });
  });

  it('merges theme tokens and message overrides', () => {
    const config = parseConfig({ ...base, theme: { accent: '#0F7B6C' }, messages: { navHome: 'Start' } });
    expect(config.theme.accent).toBe('#0F7B6C');
    expect(parseConfig({ ...base, themeDark: { canvas: '#101010' } }).themeDark.canvas).toBe('#101010');
    expect(() => parseConfig({ ...base, themeDark: { canvas: 'red}' } })).toThrow(/not allowed/);
    expect(config.messages.navHome).toBe('Start');
    expect(config.messages.navStarred).toBe(DEFAULT_MESSAGES.navStarred);
  });

  it('rejects unknown keys and unsafe values', () => {
    expect(() => parseConfig({ ...base, theme: { nope: 'x' } })).toThrow(/Unknown theme key/);
    expect(() => parseConfig({ ...base, theme: { accent: 'red;}body{display:none' } })).toThrow(/not allowed/);
    expect(() => parseConfig({ ...base, messages: { nope: 'x' } })).toThrow(/Unknown message key/);
    expect(parseConfig({ ...base, messages: { byline: 'Von {name}' } }).messages).toEqual(DEFAULT_MESSAGES);
    expect(() => parseConfig({ ...base, logoUrl: 'javascript:alert(1)' })).toThrow(/logoUrl/);
  });
});

describe('format', () => {
  it('fills placeholders and leaves unknown ones', () => {
    expect(format('Hi {name}, {x}', { name: 'Ada' })).toBe('Hi Ada, {x}');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-01-10T12:00:00Z');
  it('formats relative times', () => {
    expect(timeAgo('2026-01-10T11:59:30Z', now)).toBe('now');
    expect(timeAgo('2026-01-10T09:00:00Z', now)).toMatch(/3 hr/);
    expect(timeAgo(undefined, now)).toBe('');
  });

  it('flags pages older than a number of days', () => {
    expect(olderThan('2025-06-01T00:00:00Z', 180, now)).toBe(true);
    expect(olderThan('2026-01-01T00:00:00Z', 180, now)).toBe(false);
    expect(olderThan(undefined, 180, now)).toBe(false);
  });
});

describe('buildFolderIndex', () => {
  const index = buildFolderIndex([
    { id: 'a', name: 'Engineering', parents: ['root'] },
    { id: 'b', name: 'Onboarding', parents: ['a'] },
    { id: 'c', name: 'People', parents: ['root'] },
  ]);

  it('answers children and paths from memory', () => {
    expect(index.children('root').map(f => f.name)).toEqual(['Engineering', 'People']);
    expect(index.path('b').map(f => f.name)).toEqual(['Engineering', 'Onboarding']);
    expect(index.path(undefined)).toEqual([]);
  });

  it('lists a folder subtree for scoped search', () => {
    expect([...index.subtree('a')]).toEqual(['a', 'b']);
    expect([...index.subtree('root')].sort()).toEqual(['a', 'b', 'c', 'root']);
  });

  it('survives a parent cycle', () => {
    const cyclic = buildFolderIndex([{ id: 'x', name: 'X', parents: ['y'] }, { id: 'y', name: 'Y', parents: ['x'] }]);
    expect(cyclic.path('x').length).toBeLessThanOrEqual(50);
    expect([...cyclic.subtree('x')].sort()).toEqual(['x', 'y']);
  });
});

describe('prepareDoc', () => {
  const origin = 'https://wiki.example.com';
  const theme = { reading: 'Serif', sans: 'Sans', mono: 'Mono', ink: '#111', accent: '#33f' };

  it('marks Google code blocks and monospace paragraphs as code', () => {
    const { html } = prepareDoc(
      '<html><head><style>.c1{color:#000;font-family:"Roboto Mono"}.c2{font-family:"Arial"}</style></head><body>' +
        '<table><tr><td><p><span class="c1">npm run build</span></p></td></tr></table>' +
        '<table><tr><td><p><span class="c2">Not code</span></p></td></tr></table>' +
        '<p><span class="c1">git push</span></p><p><span class="c2">Prose</span></p></body></html>',
      origin,
      theme,
    );
    expect(html.match(/class="gw-code"/g)).toHaveLength(1);
    expect(html).toContain('.c1{color:inherit;font-family:Mono}');
    expect(html).toContain('<p class="gw-code-line"><span class="c1">git push</span></p>');
    expect(html).toContain('<p><span class="c2">Prose</span></p>');
  });

  it('lets inline-styled exports take the theme (dark mode) and marks inline code', () => {
    const { html } = prepareDoc(
      '<html><body class="doc-content" style="background-color:#ffffff;max-width:468pt;padding:72pt">' +
        '<p style="color:#000000;font-size:11pt;font-family:&quot;Arial&quot;"><span style="color:#000000;font-family:&quot;Arial&quot;">Hi</span></p>' +
        '<p><span style="font-family:&quot;Roboto Mono&quot;;color:#188038">npm ci</span></p></body></html>',
      origin,
      theme,
    );
    expect(html).toContain('style="background-color:transparent;max-width:468pt;padding:72pt"');
    expect(html).toContain('<p style="color:inherit;font-size:12.1pt;font-family:Serif">');
    expect(html).toContain('<span style="color:inherit;font-family:Serif">Hi</span>');
    expect(html).toMatch(/<p class="gw-code-line"><span style="font-family:Mono;color:#188038" class="gw-mono">npm ci<\/span><\/p>/);
  });

  it('adapts Google colours to a dark page', () => {
    const { html } = prepareDoc(
      '<html><body><table><tr><td style="background-color:#f1f3f4;border-top-color:#bdc1c6"><p><span style="color:#000000">Topic</span>' +
        '<img src="x.png" style="width: 20.00px; height: 16.00px;"></p></td>' +
        '<td><span style="color:#0000ee">Not started</span><span style="color:#fce8b2">Note</span></td></tr></table></body></html>',
      origin,
      { ...theme, scheme: 'dark' },
    );
    expect(html).toContain('background-color:color-mix(in srgb, #f1f3f4 12%, transparent)');
    expect(html).toContain('border-top-color:rgba(255,255,255,0.16)');
    expect(html).toContain('<span style="color:inherit">Topic</span>');
    expect(html).toContain('color:color-mix(in srgb, #0000ee 45%, white)');
    expect(html).toContain('<span style="color:#fce8b2">Note</span>');
    expect(html).toContain('class="gw-glyph"');
    // In light mode the author's colours stay as they are.
    const light = prepareDoc('<html><body><p style="background-color:#f1f3f4"><span style="color:#0000ee">x</span></p></body></html>', origin, theme).html;
    expect(light).toContain('background-color:#f1f3f4');
    expect(light).toContain('color:#0000ee');
  });

  it('strips scripts and event handlers', () => {
    const { html } = prepareDoc('<html><body><p onclick="x()">Hi</p><script>alert(1)</script></body></html>', origin, theme);
    expect(html).not.toMatch(/<script|onclick/);
    expect(html).toContain('<p>Hi</p>');
  });

  it('keeps links to Google files inside the wiki and unwraps redirects', () => {
    const { html } = prepareDoc(
      '<a href="https://www.google.com/url?q=https://docs.google.com/document/d/abc123/edit&sa=D">doc</a>' +
        '<a href="https://www.google.com/url?q=https://example.org/&sa=D">ext</a>',
      origin,
      theme,
    );
    expect(html).toContain(`href="${origin}/?id=abc123" target="_top"`);
    expect(html).toContain('href="https://example.org/" target="_blank" rel="noopener noreferrer"');
  });

  it('retypesets fonts, scales print sizes and lists headings', () => {
    const { html, headings } = prepareDoc(
      '<html><head><style>.c1{font-family:"Arial";font-size:11pt}.c2{font-family:"Courier New"}</style></head>' +
        '<body><h1 id="h.1">Intro</h1><h2>Setup</h2><p class="c1">x</p></body></html>',
      origin,
      theme,
    );
    expect(html).toContain('.c1{font-family:Serif;font-size:12.1pt}');
    expect(html).toContain('.c2{font-family:Mono}');
    expect(headings).toEqual([
      { id: 'h.1', text: 'Intro', level: 1 },
      { id: 'section-1', text: 'Setup', level: 2 },
    ]);
  });
});
