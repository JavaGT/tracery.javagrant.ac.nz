// outputSanitizer.js - Safe HTML for Tracery output

export const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code', 'kbd', 'samp',
  'span', 'div', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
  'a', 'abbr', 'cite', 'q', 'mark', 'small', 'sub', 'sup',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'figure', 'figcaption', 'hr',
  'img', 'picture', 'source', 'audio', 'video', 'track',
  'details', 'summary',
  'button', 'label', 'progress', 'meter', 'time'
]);

export const ALLOWED_ATTRS = new Set([
  'class', 'id', 'title', 'aria-label', 'aria-hidden', 'role',
  'href', 'target', 'rel',
  'style',
  'colspan', 'rowspan', 'scope',
  'lang', 'dir',
  'src', 'alt', 'width', 'height', 'loading',
  'controls', 'loop', 'muted', 'poster',
  'open', 'value', 'max', 'min', 'datetime'
]);

// 'setorigin' is a pseudo-protocol handled by the shadow-DOM click interceptor
const ALLOWED_URL_SCHEMES = new Set(['http', 'https', 'mailto', '#', 'setorigin', 'scrollto']);

export const ALLOWED_CSS_PROPS = new Set([
  'color', 'background', 'background-color', 'background-image',
  'font-size', 'font-weight', 'font-style', 'font-family', 'font-variant',
  'text-align', 'text-decoration', 'text-transform', 'letter-spacing', 'line-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'scroll-margin', 'scroll-margin-top', 'scroll-margin-right', 'scroll-margin-bottom', 'scroll-margin-left',
  'scroll-padding', 'scroll-padding-top', 'scroll-padding-right', 'scroll-padding-bottom', 'scroll-padding-left',
  'border', 'border-radius', 'border-color', 'border-style', 'border-width',
  'display', 'flex', 'flex-direction', 'align-items', 'justify-content',
  'width', 'max-width', 'min-width', 'height', 'max-height', 'min-height',
  'opacity', 'visibility',
  'white-space', 'word-break', 'overflow', 'overflow-wrap',
  'list-style', 'list-style-type',
]);

function sanitizeUrl(url) {
  try {
    if (url.startsWith('setorigin:') || url.startsWith('scrollto:')) return url;
    const u = new URL(url, window.location.href);
    if (ALLOWED_URL_SCHEMES.has(u.protocol.replace(':', ''))) return url;
    if (url.startsWith('#')) return url;
  } catch {}
  return '#';
}

function sanitizeStyle(styleStr) {
  if (!styleStr) return '';
  const out = [];
  for (const decl of styleStr.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!ALLOWED_CSS_PROPS.has(prop)) continue;
    // Block expressions and dangerous patterns
    if (/expression|javascript|vbscript|url\s*\(/i.test(val)) continue;
    out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

function sanitizeElement(el) {
  if (el.nodeType === Node.TEXT_NODE) return;
  if (el.nodeType !== Node.ELEMENT_NODE) {
    el.parentNode?.removeChild(el);
    return;
  }

  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // Replace with its children
    const frag = document.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    el.parentNode?.replaceChild(frag, el);
    return;
  }

  // Sanitize attributes
  const toRemove = [];
  for (const attr of el.attributes) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) {
      toRemove.push(name);
    } else if (name === 'href' || name === 'src') {
      attr.value = sanitizeUrl(attr.value);
    } else if (name === 'style') {
      const safe = sanitizeStyle(attr.value);
      if (safe) attr.value = safe;
      else toRemove.push(name);
    } else if (name === 'target') {
      // Force noopener for external links
      attr.value = '_blank';
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
  toRemove.forEach(n => el.removeAttribute(n));

  // Recurse
  const children = Array.from(el.childNodes);
  children.forEach(sanitizeElement);
}

export function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const children = Array.from(doc.body.childNodes);
  children.forEach(sanitizeElement);
  return doc.body.innerHTML;
}

export function isLikelyHTML(str) {
  return /<[a-z][\s\S]*>/i.test(str);
}
