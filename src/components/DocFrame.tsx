import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTheme } from '../lib/theme';
import { useFile, useFolders, usePathLabel, useT } from '../lib/data';
import { timeAgo } from '../lib/format';
import { navigate } from '../lib/route';
import { Kind, Link, spaceStyle } from './ui';

const DOC_LINK = /^https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([\w-]+)/;
const MONO_FONT = /mono|courier|consolas|menlo|code/i;

/** Google wraps outbound links in a redirect; link to the destination instead. */
function unwrap(href: string): string {
  try {
    const url = new URL(href);
    return url.hostname === 'www.google.com' && url.pathname === '/url' ? url.searchParams.get('q') ?? href : href;
  } catch {
    return href;
  }
}

export interface Heading {
  id: string;
  text: string;
  level: number;
}

/**
 * Turns a Google Doc HTML export into a page that reads like the rest of the wiki:
 * sanitised, typeset with the theme's fonts, links to other Google files opening
 * inside the wiki, and its headings listed for the table of contents.
 */
export interface DocTheme {
  reading: string;
  sans: string;
  mono: string;
  ink: string;
  accent: string;
  /** Must match the app's, or the browser paints the frame with an opaque default background. */
  scheme?: 'light' | 'dark';
  /** The theme's font stylesheet, so the frame can use the same faces. */
  fontsUrl?: string;
  /** Heading face for h1 and h2; the sans face otherwise. */
  display?: string;
  /** The app's own @font-face rules, so bundled faces work inside the frame too. */
  fontFaces?: string;
  /** Accessible name of the link button on each heading. */
  anchorLabel?: string;
}

/** Google exports in print sizes (11pt body); scale them up for reading on screen. */
const SCREEN_SCALE = 1.1;

/** A CSS colour (#rgb, #rrggbb or rgb()) as 0–255 channels, or undefined for anything else. */
function parseColor(value: string): [number, number, number] | undefined {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : undefined;
}

/** Relative luminance, 0 (black) to 1 (white). */
const luminance = ([r, g, b]: [number, number, number]) => {
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/**
 * Google colours are picked for a white page. On a dark page, light fills (table headers,
 * highlights) become a faint tint of themselves and dark text is lifted towards white, so
 * nothing ends up light-on-light or dark-on-dark.
 */
function adaptForDark(css: string) {
  return css
    .replace(/(^|[;{\s])(background(?:-color)?):\s*([^;}]+)/gi, (match, lead: string, prop: string, value: string) => {
      const c = parseColor(value);
      return c && luminance(c) > 0.4 ? `${lead}${prop}:color-mix(in srgb, ${value.trim()} 12%, transparent)` : match;
    })
    .replace(/(^|[;{\s])color:\s*([^;}]+)/gi, (match, lead: string, value: string) => {
      const c = parseColor(value);
      if (!c || luminance(c) > 0.18) return match;
      const grey = Math.max(...c) - Math.min(...c) < 24;
      return `${lead}color:${grey ? 'inherit' : `color-mix(in srgb, ${value.trim()} 45%, white)`}`;
    })
    .replace(/(border(?:-\w+)?-color):\s*([^;}]+)/gi, (match, prop: string, value: string) => {
      const c = parseColor(value);
      // Table rules drawn for paper (light greys, black) become a quiet line on the dark page.
      const grey = c && Math.max(...c) - Math.min(...c) < 24;
      return grey ? `${prop}:rgba(255,255,255,0.16)` : match;
    });
}

export function prepareDoc(html: string, origin: string, theme: DocTheme) {
  const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORBID_TAGS: ['form', 'input', 'button'] });
  const doc = new DOMParser().parseFromString(clean, 'text/html');

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = unwrap(a.getAttribute('href') ?? '');
    const id = DOC_LINK.exec(href)?.[1];
    if (id) {
      a.setAttribute('href', `${origin}/?id=${encodeURIComponent(id)}`);
      a.setAttribute('target', '_top');
    } else if (!href.startsWith('#')) {
      a.setAttribute('href', href);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }

  // Google exports a code block (Insert > Building blocks > Code block) as a one-cell table of
  // monospace runs; text set in a code font by hand comes out as monospace paragraphs. Both
  // are only recognisable by their classes, so find the monospace ones before restyling fonts.
  // Older exports style through classes in a <style> block, newer ones inline on each element.
  const monoClasses = new Set<string>(['gw-mono']);
  for (const style of doc.querySelectorAll('style')) {
    for (const [, name, family] of (style.textContent ?? '').matchAll(/\.([\w-]+)\{[^}]*?font-family:\s*([^;}]+)/g)) {
      if (name && MONO_FONT.test(family ?? '')) monoClasses.add(name);
    }
  }
  for (const span of doc.querySelectorAll<HTMLElement>('span[style*="font-family"]')) {
    if (MONO_FONT.test(/font-family:\s*([^;]+)/.exec(span.getAttribute('style') ?? '')?.[1] ?? '')) span.classList.add('gw-mono');
  }
  const isCode = (el: Element) => {
    const runs = [...el.querySelectorAll('span')].filter(span => span.textContent?.trim());
    return runs.length > 0 && runs.every(span => [...span.classList].some(c => monoClasses.has(c)));
  };
  for (const table of doc.querySelectorAll('table')) {
    if (table.querySelectorAll('td').length === 1 && isCode(table)) table.classList.add('gw-code');
  }
  for (const p of doc.querySelectorAll('body > p')) if (isCode(p)) p.classList.add('gw-code-line');

  // Keep the author's monospace runs; set everything else in the reading face.
  const restyle = (css: string) =>
    css
      .replace(/font-family:\s*([^;}]+)/g, (_, family: string) => `font-family:${MONO_FONT.test(family) ? theme.mono : theme.reading}`)
      .replace(/font-size:\s*([\d.]+)pt/g, (_, size: string) => `font-size:${(Number(size) * SCREEN_SCALE).toFixed(1)}pt`)
      // Google writes plain text as black on white; let it take the theme's colours instead (dark mode).
      .replace(/(^|[;{\s])color:\s*#000(?:000)?(?=\s*(?:[;}]|$))/gi, '$1color:inherit')
      .replace(/background-color:\s*#fff(?:fff)?(?=\s*(?:[;}]|$))/gi, 'background-color:transparent');
  const adapt = theme.scheme === 'dark' ? (css: string) => adaptForDark(restyle(css)) : restyle;
  for (const style of doc.querySelectorAll('style')) style.textContent = adapt(style.textContent ?? '');
  for (const el of doc.querySelectorAll('[style]')) el.setAttribute('style', adapt(el.getAttribute('style') ?? ''));

  // Tiny images are glyphs Google draws in black, like the column-type icons of a table.
  for (const img of doc.querySelectorAll('img')) {
    const size = (dim: string) => Number(new RegExp(`(?:^|;)\\s*${dim}:\\s*([\\d.]+)px`).exec(img.getAttribute('style') ?? '')?.[1] ?? Infinity);
    if (size('width') <= 24 && size('height') <= 24) img.classList.add('gw-glyph');
  }

  const headings: Heading[] = [];
  doc.querySelectorAll('h1, h2, h3').forEach((el, i) => {
    const text = el.textContent?.trim();
    if (!text) return;
    el.id ||= `section-${i}`;
    headings.push({ id: el.id, text, level: Number(el.tagName[1]) });
    // A link button on every heading; the app copies the section's address when it is clicked.
    const anchor = doc.createElement('a');
    anchor.className = 'gw-anchor';
    anchor.href = `#${el.id}`;
    anchor.setAttribute('aria-label', theme.anchorLabel ?? '');
    anchor.setAttribute('title', theme.anchorLabel ?? '');
    anchor.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
    el.appendChild(anchor);
  });

  const style = doc.createElement('style');
  style.textContent = `
    html { background: transparent; color-scheme: ${theme.scheme ?? 'light'}; }
    body { max-width: none !important; margin: 0 !important; padding: 0 0 24px !important; color: ${theme.ink}; font-family: ${theme.reading}; overflow: hidden; }
    p, li { line-height: 1.7 !important; }
    h1, h2, h3, h4, h1 *, h2 *, h3 *, h4 * { font-family: ${theme.sans} !important; letter-spacing: -0.015em; font-weight: 600 !important; }
    h1, h2, h1 *, h2 * { font-family: ${theme.display ?? theme.sans} !important; font-weight: 700 !important; }
    h1, h2, h3 { margin: 1.6em 0 0.5em !important; line-height: 1.25 !important; }
    h1, h1 * { font-size: 26px !important; }
    h2, h2 * { font-size: 21px !important; }
    h3, h3 * { font-size: 16px !important; }
    img { max-width: 100%; height: auto; }
    ${theme.scheme === 'dark' ? '.gw-glyph { filter: invert(1); opacity: 0.7; }' : ''}
    .gw-anchor { display: inline-grid !important; place-items: center; width: 28px; height: 28px; margin-left: 8px; vertical-align: middle; border-radius: 8px; opacity: 0; color: color-mix(in srgb, ${theme.ink} 55%, transparent) !important; background: color-mix(in srgb, ${theme.ink} 6%, transparent); text-decoration: none; transition: opacity 120ms; }
    h1:hover .gw-anchor, h2:hover .gw-anchor, h3:hover .gw-anchor, .gw-anchor:focus { opacity: 1; }
    .gw-anchor svg { display: block; }
    table { max-width: 100%; border-collapse: collapse; }
    a, a * { color: ${theme.accent} !important; text-underline-offset: 3px; }
    .gw-code, .gw-code-line { background: color-mix(in srgb, ${theme.ink} 5%, transparent) !important; }
    .gw-code { width: 100% !important; margin: 16px 0 !important; border-radius: 8px; overflow: hidden; }
    .gw-code td { padding: 14px 18px !important; border: 0 !important; background: none !important; overflow-x: auto; }
    .gw-code p, .gw-code-line { line-height: 1.6 !important; white-space: pre-wrap; }
    .gw-code *, .gw-code-line * { font-size: 13.5px !important; font-family: ${theme.mono} !important; }
    .gw-code-line { margin: 0 !important; padding: 0 18px !important; }
    :not(.gw-code-line) + .gw-code-line { margin-top: 16px !important; padding-top: 14px !important; border-radius: 8px 8px 0 0; }
    .gw-code-line:not(:has(+ .gw-code-line)) { margin-bottom: 16px !important; padding-bottom: 14px !important; border-radius: 0 0 8px 8px; }
    :not(.gw-code-line) + .gw-code-line:not(:has(+ .gw-code-line)) { border-radius: 8px; }
  `;
  doc.head.appendChild(style);
  if (theme.fontFaces) {
    const faces = doc.createElement('style');
    faces.textContent = theme.fontFaces;
    doc.head.prepend(faces);
  }
  if (theme.fontsUrl) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = theme.fontsUrl;
    doc.head.prepend(link);
  }
  const words = (doc.body.textContent ?? '').split(/\s+/).filter(Boolean).length;
  return { html: '<!doctype html>' + doc.documentElement.outerHTML, headings, words };
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Every @font-face the app has loaded, with font URLs made absolute so they resolve inside the frame. */
function fontFaceRules() {
  const rules: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSFontFaceRule) {
          const base = sheet.href ?? location.href;
          rules.push(rule.cssText.replace(/url\("?([^")]+)"?\)/g, (_, url: string) => `url("${new URL(url, base).href}")`));
        }
      }
    } catch {
      // A cross-origin stylesheet (e.g. a brand's fontsUrl) can't be read; the frame loads that one itself.
    }
  }
  return rules.join('\n');
}

export interface Outline {
  headings: Heading[];
  words: number;
}

/** The wiki page a link inside a document points to, if it points to one. */
function wikiId(target: EventTarget | null): { id: string; anchor: Element } | undefined {
  // Elements come from the frame's realm, so `instanceof Element` would fail here.
  const anchor = (target as Element | null)?.closest?.('a[href]');
  const href = anchor?.getAttribute('href');
  if (!anchor || !href?.startsWith(`${location.origin}/?`)) return undefined;
  const id = new URL(href).searchParams.get('id');
  return id ? { id, anchor } : undefined;
}

const PREVIEW_WIDTH = 320;
const PREVIEW_DELAY = 350;

/** A small card about the wiki page under the pointer: where it lives and who edited it last. */
function LinkPreview({ id, x, y, onHover }: { id: string; x: number; y: number; onHover: (inside: boolean) => void }) {
  const t = useT();
  const file = useFile(id);
  const space = useFolders().data?.path(file.data?.parents?.[0])[0];
  const pathLabel = usePathLabel();
  if (file.isError) return null;
  const editor = file.data?.lastModifyingUser?.displayName;
  return (
    <Link
      to={{ id }}
      className="link-preview"
      style={{ left: x, top: y, width: PREVIEW_WIDTH, ...(space && spaceStyle(space)) }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {file.data ? (
        <>
          <span className="link-preview-path truncate">{pathLabel(file.data) || '\u00a0'}</span>
          <span className="link-preview-title"><Kind mimeType={file.data.mimeType} /> <strong>{file.data.name}</strong></span>
          <span className="link-preview-meta truncate">
            {editor && t('editedBy', { name: editor })}
            {editor && file.data.modifiedTime && ' · '}
            {timeAgo(file.data.modifiedTime)}
          </span>
        </>
      ) : (
        <span className="skeleton" style={{ width: '70%' }} />
      )}
    </Link>
  );
}

/**
 * Rendered in a sandbox with no script permission, so nothing in a document can
 * run code, whatever got past sanitising. Same-origin access is granted only so
 * the app can size the frame to its content and scroll to a heading.
 */
export function DocFrame({ html, title, fontsUrl, onOutline, onAnchor }: { html: string; title: string; fontsUrl?: string; onOutline: (outline: Outline) => void; onAnchor: (sectionId: string) => void }) {
  const anchorLabel = useT()('copySectionLink');
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver>(null);
  const [height, setHeight] = useState(0);
  const theme = useTheme().resolved;
  const prepared = useMemo(
    () =>
      prepareDoc(html, location.origin, {
        reading: cssVar('--font-reading'),
        sans: cssVar('--font-sans'),
        display: cssVar('--font-display'),
        fontFaces: fontFaceRules(),
        mono: cssVar('--font-mono'),
        ink: cssVar('--ink'),
        accent: cssVar('--accent-ink'),
        scheme: theme,
        fontsUrl,
        anchorLabel,
      }),
    // The theme's colours are read when preparing, so a light/dark switch prepares again.
    [html, fontsUrl, theme, anchorLabel],
  );

  useEffect(() => onOutline({ headings: prepared.headings, words: prepared.words }), [prepared, onOutline]);
  useEffect(() => () => observer.current?.disconnect(), []);

  // A link to a section (/?id=…#heading) lands on that heading once the frame has its full height.
  const section = useRef(decodeURIComponent(location.hash.slice(1)));
  useEffect(() => {
    if (!height || !section.current) return;
    scrollToHeading(section.current, 'instant');
    section.current = '';
  }, [height]);
  useEffect(() => {
    const onHash = () => scrollToHeading(decodeURIComponent(location.hash.slice(1)));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Link previews: shown after a short hover, kept while the pointer is on the link or the card.
  const [preview, setPreview] = useState<{ id: string; x: number; y: number }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const schedule = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // The card is placed for where the link was; once the page scrolls, it is in the wrong place.
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(undefined);
    window.addEventListener('scroll', hide, { passive: true, once: true });
    return () => window.removeEventListener('scroll', hide);
  }, [preview]);

  // Grow the frame to its content (images load late), so the page scrolls as one.
  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) return;
    observer.current?.disconnect();
    observer.current = new ResizeObserver(() => setHeight(body.scrollHeight));
    observer.current.observe(body);

    // The frame runs no scripts of its own; these listeners belong to the app.
    doc.addEventListener('click', e => {
      // Nodes in the frame belong to its own realm, so `instanceof Element` would be false here.
      const anchor = (e.target as Element | null)?.closest?.('.gw-anchor');
      if (anchor) {
        e.preventDefault();
        onAnchor(anchor.getAttribute('href')?.slice(1) ?? '');
        return;
      }
      const link = wikiId(e.target);
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate({ id: link.id });
    });
    doc.addEventListener('mouseover', e => {
      const link = wikiId(e.target);
      if (!link) return;
      schedule(() => {
        const frameBox = frame.current?.getBoundingClientRect();
        const box = link.anchor.getBoundingClientRect();
        if (!frameBox) return;
        const below = frameBox.top + box.bottom + 8;
        setPreview({
          id: link.id,
          x: Math.max(8, Math.min(frameBox.left + box.left, innerWidth - PREVIEW_WIDTH - 8)),
          y: below + 120 > innerHeight ? frameBox.top + box.top - 128 : below,
        });
      }, PREVIEW_DELAY);
    });
    doc.addEventListener('mouseout', e => {
      if (wikiId(e.target) && wikiId(e.relatedTarget)?.anchor !== wikiId(e.target)?.anchor) schedule(() => setPreview(undefined), 200);
    });
  };

  return (
    <>
      <iframe
        ref={frame}
        className="doc-frame"
        title={title}
        srcDoc={prepared.html}
        onLoad={onLoad}
        style={{ height: height || undefined }}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      />
      {preview && <LinkPreview {...preview} onHover={inside => (inside ? clearTimeout(timer.current) : schedule(() => setPreview(undefined), 200))} />}
    </>
  );
}

/** Room for whatever is pinned to the top of the window (the small-screen bar, the page bar) above a heading. */
export const headingOffset = () =>
  [...document.querySelectorAll('.globalnav, .pagebar')].reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) + 16;

/** Scrolls the page so a heading inside the document frame sits under the top bar. */
export function scrollToHeading(id: string, behavior: ScrollBehavior = 'smooth') {
  const frame = document.querySelector<HTMLIFrameElement>('.doc-frame');
  const target = frame?.contentDocument?.getElementById(id);
  if (!frame || !target) return;
  const top = frame.getBoundingClientRect().top + window.scrollY + target.offsetTop - headingOffset();
  window.scrollTo({ top, behavior });
}
