const DANGEROUS_SVG_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'applet',
  'meta',
  'link',
]);

/**
 * Strips scriptable tags, inline event handlers (on*), and unsafe URI attributes
 * from SVG blueprint markup before rendering or persisting imported backup sheets.
 */
export function sanitizeSvgMarkup(rawSvg: string): string {
  if (!rawSvg || typeof rawSvg !== 'string') return '';

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
      const parserError = doc.querySelector('parsererror');
      const root = doc.documentElement;
      if (!parserError && root && root.tagName.toLowerCase() === 'svg') {
        const elements = [root, ...Array.from(root.querySelectorAll('*'))];
        for (const el of elements) {
          if (DANGEROUS_SVG_TAGS.has(el.tagName.toLowerCase())) {
            el.remove();
            continue;
          }
          for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            const val = attr.value.trim().toLowerCase();
            if (name.startsWith('on')) {
              el.removeAttribute(attr.name);
              continue;
            }
            if (
              (name === 'href' || name === 'xlink:href' || name === 'src') &&
              (val.startsWith('javascript:') ||
                val.startsWith('vbscript:') ||
                val.startsWith('data:text/html'))
            ) {
              el.removeAttribute(attr.name);
            }
          }
        }
        return new XMLSerializer().serializeToString(root);
      }
    } catch {
      // Fallback to structural strip below if DOMParser fails on edge fragments
    }
  }

  return rawSvg
    .replace(/<\s*(script|foreignObject|iframe|object|embed|applet)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe|object|embed|applet)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html):[^"]*"|'\s*(?:javascript|vbscript|data:text\/html):[^']*')/gi, '$1=""');
}

/**
 * Allows only safe http/https URLs for external authority portal links.
 */
export function sanitizeSafeHttpUrl(
  url: unknown,
  fallback = 'https://portal.shjmun.gov.ae'
): string {
  if (typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString().slice(0, 500);
    }
  } catch {
    return fallback;
  }
  return fallback;
}

/**
 * Validates binary preview/download URLs so non-blob / scriptable data URLs are blocked.
 */
export function sanitizePreviewBinaryUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('blob:')) return trimmed;
  if (/^data:(application\/pdf|image\/(png|jpeg|jpg|webp|gif));base64,[a-zA-Z0-9+/=\s]+$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}
