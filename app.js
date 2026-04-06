// ── Syntax Highlighting Override ───────────────────────────────
let forceDisableSyntaxHighlighting = false;

function setForceDisableSyntaxHighlighting(val) {
  forceDisableSyntaxHighlighting = !!val;
  updateSyntaxHighlighting('grammar');
  updateSyntaxHighlighting('css');
}
// app.js - Tracery Studio main application
import tracery from './js/tracery/main.js';
const { createGrammar } = tracery;
import { sanitizeHTML, isLikelyHTML, ALLOWED_TAGS, ALLOWED_ATTRS, ALLOWED_CSS_PROPS } from './js/outputSanitizer.js';
import { buildShareURL, loadFromURL, CSS_EMBED_KEY } from './js/stateCodec.js';

// ── Default grammar ───────────────────────────────────────────────
const DEFAULT_GRAMMAR = {
  "origin": [
    "<article class='card'><h1 class='title'>#title#</h1><p class='line'>The <span class='adj'>#adj#</span> <span class='creature'>#creature#</span> #verb# through the #place#.</p><p class='line'>It left <span class='trail'>#trail#</span> behind.</p></article>"
  ],
  "title": ["Tracery Starter", "Story Fragment", "Generator Output"],
  "adj": ["ancient", "luminous", "forgotten", "restless", "iridescent"],
  "creature": ["fox", "traveler", "ghost", "moth", "river spirit"],
  "verb": ["wandered", "drifted", "slipped", "danced", "moved silently"],
  "place": ["silver forest", "ruined archive", "dream corridor", "fog library"],
  "trail": ["starlight", "echoes", "soft static", "half-remembered names", "petal ash"],
  [CSS_EMBED_KEY]: ".card {\n margin: 1rem;\n  padding: 1rem 1.2rem;\n  border: 1px solid #2f3547;\n  border-radius: 0.75rem;\n  background: #171a24;\n  color: #eef2ff;\n  max-width: 60ch;\n}\n\n.title {\n  margin: 0 0 0.6rem;\n  font-size: 1.1rem;\n}\n\n.line {\n  margin: 0.35rem 0;\n  line-height: 1.55;\n}\n\n.adj { color: #ffd27a; }\n.creature { color: #88d4ff; font-weight: 600; }\n.trail { color: #b8f2c2; }"
};

function cloneDefaultGrammar() {
  return JSON.parse(JSON.stringify(DEFAULT_GRAMMAR));
}

function cloneGrammarWithoutEmbeddedCss(grammar) {
  const clone = JSON.parse(JSON.stringify(grammar || {}));
  if (clone && typeof clone === 'object') {
    delete clone[CSS_EMBED_KEY];
  }
  return clone;
}

function cloneGrammarWithEmbeddedCss(grammar, embeddedCss) {
  const clone = cloneGrammarWithoutEmbeddedCss(grammar);
  clone[CSS_EMBED_KEY] = String(embeddedCss || '');
  return clone;
}

const THEME_STORAGE_KEY = 'traceryThemePreference';
const VALID_THEMES = new Set(['auto', 'light', 'dark', 'pink-pop', 'noir', 'academic', 'arcade', 'vscode-dark-plus']);
const SYNTAX_HIGHLIGHT_LIMITS = {
  disableAtChars: 24000,
  enableAtChars: 18000,
  disableAtLines: 1200,
  enableAtLines: 900
};

// ── State ─────────────────────────────────────────────────────────
let grammarObj = {};
let cssText = '';
let isDirty = false;
let shadowRoot = null;
let grammarHistory = [''];
let grammarHistoryIdx = 0;
let cssHistory = [''];
let cssHistoryIdx = 0;
let autoReroll = true;
let lastValidGrammar = null;
let rerollCount = 0;
let autoSyncTimer = null;
let autoSyncVersion = 0;
let originSymbol = 'origin';
let syntaxHighlightingEnabled = {
  grammar: true,
  css: true
};

// ── DOM refs ──────────────────────────────────────────────────────
const grammarEditor = document.getElementById('grammar-editor');
const cssEditor = document.getElementById('css-editor');
const grammarHighlight = document.getElementById('grammar-highlight');
const cssHighlight = document.getElementById('css-highlight');
const grammarGutter = document.getElementById('grammar-gutter');
const cssGutter = document.getElementById('css-gutter');
const errorOverlay = document.getElementById('error-overlay');
const previewHost = document.getElementById('preview-host');
const btnReroll = document.getElementById('btn-reroll');
const btnShare = document.getElementById('btn-share');
const btnFormat = document.getElementById('btn-format');
const btnSave = document.getElementById('btn-save');
const btnLoad = document.getElementById('btn-load');
const btnExamples = document.getElementById('btn-examples');
const btnSettings = document.getElementById('btn-settings');
const btnLoadFile = document.getElementById('btn-load-file');
const originInput = document.getElementById('origin-input');
const saveIndicator = document.getElementById('save-indicator');
const statusSymbols = document.getElementById('status-symbols');
const statusValid = document.getElementById('status-valid');
const rerollStat = document.getElementById('reroll-stat');
const autoRerollCb = document.getElementById('auto-reroll-cb');
const modalOverlay = document.getElementById('modal-overlay');
const modalUrl = document.getElementById('modal-url');
const btnModalClose = document.getElementById('btn-modal-close');
const btnModalCopy = document.getElementById('btn-modal-copy');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsThemeSelect = document.getElementById('settings-theme-select');
const btnSettingsClose = document.getElementById('btn-settings-close');

const btnHelp = document.getElementById('btn-help');
const helpOverlay = document.getElementById('help-overlay');
const btnHelpClose = document.getElementById('btn-help-close');

function openHelpModal() {
  if (helpOverlay) helpOverlay.classList.add('open');
}

function closeHelpModal() {
  if (helpOverlay) helpOverlay.classList.remove('open');
}
const toast = document.getElementById('toast');
const resizeHandles = document.querySelectorAll('.resize-handle');

function getSavedThemePreference() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
    return VALID_THEMES.has(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function saveThemePreference(value) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures.
  }
}

function applyThemePreference(value) {
  const theme = VALID_THEMES.has(value) ? value : 'auto';
  const root = document.documentElement;

  if (theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }

  if (settingsThemeSelect) {
    settingsThemeSelect.value = theme;
  }
}

function openSettingsModal() {
  if (!settingsOverlay) {
    return;
  }
  settingsOverlay.classList.add('open');
}

function closeSettingsModal() {
  if (!settingsOverlay) {
    return;
  }
  settingsOverlay.classList.remove('open');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getTextMetrics(text) {
  const source = String(text || '');
  return {
    chars: source.length,
    lines: Math.max(1, source.split('\n').length)
  };
}

function shouldHighlightSyntax(kind, text) {
  if (forceDisableSyntaxHighlighting) return false;
  const metrics = getTextMetrics(text);
  const enabled = syntaxHighlightingEnabled[kind] !== false;
  if (enabled) {
    return metrics.chars <= SYNTAX_HIGHLIGHT_LIMITS.disableAtChars
      && metrics.lines <= SYNTAX_HIGHLIGHT_LIMITS.disableAtLines;
  }
  return metrics.chars <= SYNTAX_HIGHLIGHT_LIMITS.enableAtChars
    && metrics.lines <= SYNTAX_HIGHLIGHT_LIMITS.enableAtLines;
}

function getEditorStage(kind) {
  return kind === 'grammar'
    ? document.getElementById('grammar-editor-wrap')?.querySelector('.editor-stage')
    : document.getElementById('css-editor-wrap')?.querySelector('.editor-stage');
}

function getHighlightElement(kind) {
  return kind === 'grammar' ? grammarHighlight : cssHighlight;
}

function getEditorElement(kind) {
  return kind === 'grammar' ? grammarEditor : cssEditor;
}

function setSyntaxHighlightingState(kind, enabled) {
  syntaxHighlightingEnabled[kind] = enabled;
  const stage = getEditorStage(kind);
  if (!stage) {
    return;
  }

  stage.classList.toggle('syntax-disabled', !enabled);
}

function highlightJson(text) {
  const src = String(text || '');
  const tokenRe = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]/g;
  let out = '';
  let cursor = 0;
  let match;

  while ((match = tokenRe.exec(src)) !== null) {
    const token = match[0];
    const idx = match.index;
    out += escapeHtml(src.slice(cursor, idx));

    if (token[0] === '"') {
      const trailing = src.slice(idx + token.length);
      const isKey = /^\s*:/.test(trailing);
      if (isKey) {
        out += `<span class="tok-key">${escapeHtml(token)}</span>`;
      } else {
        // Strip surrounding quotes and sub-tokenise for Tracery + HTML
        const inner = token.slice(1, -1);
        out += `<span class="tok-string">"${highlightTraceryString(inner)}"</span>`;
      }
    } else if (token === 'true' || token === 'false') {
      out += `<span class="tok-bool">${token}</span>`;
    } else if (token === 'null') {
      out += '<span class="tok-null">null</span>';
    } else if (/^-?\d/.test(token)) {
      out += `<span class="tok-number">${token}</span>`;
    } else {
      out += `<span class="tok-punc">${escapeHtml(token)}</span>`;
    }

    cursor = idx + token.length;
  }

  out += escapeHtml(src.slice(cursor));
  return out;
}

/**
 * Sub-tokenise the interior of a JSON string value, highlighting:
 *  - Tracery symbol refs:  #symbol#, #symbol.mod#
 *  - Tracery push/pop actions: [key:rule], [key]
 *  - HTML tags:            <tag attr="val">, </tag>
 * Everything else inherits the parent tok-string colour.
 */
function highlightTraceryString(raw) {
  // Match (priority order):
  //  1. Full Tracery expression: #[action][action]symbol#  (actions may contain nested #refs#)
  //  2. Standalone action block: [key:value] outside a #...# expression
  //  3. HTML tag:                <tag ...>, </tag>
  const tokenRe = /(#(?:\[[^\]]*\])*[^#\[\]\s"\\]*#)|(\[[^\]]*\])|(<\/?[A-Za-z][^>]*>)/g;
  let out = '';
  let cursor = 0;
  let m;

  while ((m = tokenRe.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(cursor, m.index));
    const [full, traceryExpr, traceryAction, htmlTag] = m;

    if (traceryExpr) {
      out += highlightTraceryExpr(full);
    } else if (traceryAction) {
      out += `<span class="tok-tracery-action">${escapeHtml(full)}</span>`;
    } else if (htmlTag) {
      out += highlightHtmlTag(full);
    }

    cursor = m.index + full.length;
  }

  out += escapeHtml(raw.slice(cursor));
  return out;
}

/**
 * Highlight a full Tracery expression like #[hero:#name#][heroPet:#animal#]story.cap#
 * Breaking it into: # delimiters, [action] blocks, and the final symbol.modifier name.
 */
function highlightTraceryExpr(expr) {
  // expr starts and ends with #
  const inner = expr.slice(1, -1);
  const punc = `<span class="tok-tracery-symbol">#</span>`;
  let out = punc;

  // Match [action] blocks and the trailing symbol+modifiers
  const partRe = /(\[[^\]]*\])|([^#\[\]]+)/g;
  let m;
  while ((m = partRe.exec(inner)) !== null) {
    if (m[1]) {
      out += `<span class="tok-tracery-action">${escapeHtml(m[1])}</span>`;
    } else if (m[2]) {
      out += `<span class="tok-tracery-symbol">${escapeHtml(m[2])}</span>`;
    }
  }

  out += punc;
  return out;
}

/** Colour the bracket, tag name, attributes, and closing bracket of one HTML tag. */
function highlightHtmlTag(tag) {
  const m = /^(<\/?)([A-Za-z][A-Za-z0-9-]*)([\s\S]*?)(\/?>)$/.exec(tag);
  if (!m) return `<span class="tok-html-tag">${escapeHtml(tag)}</span>`;
  const [, open, name, attrs, close] = m;
  return (
    `<span class="tok-html-tag">${escapeHtml(open)}${escapeHtml(name)}</span>` +
    highlightHtmlAttrs(attrs) +
    `<span class="tok-html-tag">${escapeHtml(close)}</span>`
  );
}

/** Colour attribute name=value pairs inside a tag's attribute string. */
function highlightHtmlAttrs(attrs) {
  if (!attrs || !attrs.trim()) return escapeHtml(attrs);
  const attrRe = /(\s+)([A-Za-z_:][A-Za-z0-9_.:-]*)(?:(=)(?:("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([^\s>"'`=<>/]+)))?/g;
  let out = '';
  let cursor = 0;
  let m;

  while ((m = attrRe.exec(attrs)) !== null) {
    out += escapeHtml(attrs.slice(cursor, m.index));
    const [full, ws, name, eq, quotedVal, unquotedVal] = m;
    out += escapeHtml(ws);
    out += `<span class="tok-html-attr">${escapeHtml(name)}</span>`;
    if (eq) {
      out += `<span class="tok-html-tag">=</span>`;
      out += `<span class="tok-html-attrval">${escapeHtml(quotedVal ?? unquotedVal ?? '')}</span>`;
    }
    cursor = m.index + full.length;
  }

  out += escapeHtml(attrs.slice(cursor));
  return out;
}


function highlightCss(text) {
  const src = String(text || '');
  const tokenRe = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#[A-Za-z0-9_-]+|\.[A-Za-z0-9_-]+|[A-Za-z_-][A-Za-z0-9_-]*)(?=\s*\{)|([A-Za-z-]+)(?=\s*:)|(:|;|\{|\})/g;
  let out = '';
  let cursor = 0;
  let match;

  while ((match = tokenRe.exec(src)) !== null) {
    out += escapeHtml(src.slice(cursor, match.index));
    const [full, comment, str, selector, property, punct] = match;

    if (comment) {
      out += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="tok-value">${escapeHtml(str)}</span>`;
    } else if (selector) {
      out += `<span class="tok-selector">${escapeHtml(selector)}</span>`;
    } else if (property) {
      out += `<span class="tok-property">${escapeHtml(property)}</span>`;
    } else if (punct) {
      out += `<span class="tok-punc">${escapeHtml(punct)}</span>`;
    } else {
      out += escapeHtml(full);
    }

    cursor = match.index + full.length;
  }

  out += escapeHtml(src.slice(cursor));
  return out;
}

function normalizeHighlightText(text) {
  const src = String(text || '');
  return src.endsWith('\n') ? src + ' ' : src;
}

function updateSyntaxHighlighting(kind) {
  const editor = getEditorElement(kind);
  const highlight = getHighlightElement(kind);
  if (!editor || !highlight) {
    return;
  }

  const enabled = shouldHighlightSyntax(kind, editor.value || '');
  setSyntaxHighlightingState(kind, enabled);

  if (!enabled) {
    highlight.innerHTML = '';
    return;
  }

  const source = normalizeHighlightText(editor.value || '');

  if (kind === 'grammar') {
    highlight.innerHTML = highlightJson(source);
  } else {
    highlight.innerHTML = highlightCss(source);
  }
}

function syncHighlightScroll(editor, highlight) {
  // Toggle this to true to enable debug logging
  const DEBUG_SCROLL_SYNC = true;
  if (!editor || !highlight) {
    return;
  }

  const editorMaxTop = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const highlightMaxTop = Math.max(0, highlight.scrollHeight - highlight.clientHeight);
  const editorMaxLeft = Math.max(0, editor.scrollWidth - editor.clientWidth);
  const highlightMaxLeft = Math.max(0, highlight.scrollWidth - highlight.clientWidth);

  const topRatio = editorMaxTop > 0 ? editor.scrollTop / editorMaxTop : 0;
  const leftRatio = editorMaxLeft > 0 ? editor.scrollLeft / editorMaxLeft : 0;

  let targetTop = topRatio * highlightMaxTop;
  let targetLeft = leftRatio * highlightMaxLeft;

  // Calibration for bottom edge
  if (editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 1) {
    targetTop = highlight.scrollHeight - highlight.clientHeight;
  }
  if (editor.scrollLeft === 0) {
    targetLeft = 0;
  }


  highlight.scrollTop = targetTop;
  highlight.scrollLeft = targetLeft;
}

function renderEditorHighlights() {
  updateSyntaxHighlighting('grammar');
  updateSyntaxHighlighting('css');
}

function getLineFromOffset(text, offset) {
  const safe = Math.max(0, Math.min(Number(offset) || 0, String(text).length));
  return String(text).slice(0, safe).split('\n').length;
}

// ── Shadow DOM setup ─────────────────────────────────────────────
function initShadow() {
  shadowRoot = previewHost.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style id="builtin-style">
      .origin-warning {
        font-family: sans-serif;
        padding: 1rem 1.2rem;
        margin: 1rem;
        border: 1px solid darkorange;
        border-radius: 6px;
        background: rgba(255,140,0,0.07);
      }
      .origin-warning strong {
        display: block;
        margin-bottom: .4rem;
        color: darkorange;
        font-size: 1rem;
      }
      .origin-warning p {
        margin: .3rem 0;
        font-size: .9rem;
        color: #666;
        line-height: 1.5;
      }
      .origin-warning code {
        background: rgba(0,0,0,0.07);
        padding: 1px 5px;
        border-radius: 3px;
        font-family: monospace;
      }
    </style>
    <style id="user-style"></style>
    <div id="output"></div>`;

  // ── Shadow-root anchor interceptor ──────────────────────────────
  // One handler covers all anchor clicks inside the preview.
  shadowRoot.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;

    const href = a.getAttribute('href') || '';

    // setorigin: pseudo-protocol — navigate to a different grammar symbol
    if (href.startsWith('setorigin:')) {
      e.preventDefault();
      const symbol = decodeURIComponent(href.slice('setorigin:'.length).trim());
      if (symbol) {
        originSymbol = symbol;
        if (originInput) {
          originInput.value = symbol;
          setOriginInputValidity(true);
        }
        const u = new URL(window.location.href);
        if (symbol !== 'origin') {
          u.searchParams.set('o', symbol);
        } else {
          u.searchParams.delete('o');
        }
        window.history.replaceState(null, '', u.toString());
        render();
      }
      return;
    }

    // scrollto: pseudo-protocol — scroll an element into view within the shadow DOM
    if (href.startsWith('scrollto:')) {
      e.preventDefault();
      const selector = decodeURIComponent(href.slice('scrollto:'.length).trim());
      try {
        const targetEl = shadowRoot.querySelector(selector);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (err) {
        console.warn('Invalid scrollto selector', selector);
      }
      return;
    }

    // All other links: force new tab so the app never navigates away
    if (href && href !== '#') {
      e.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  });
}

// ── Gutter rendering ─────────────────────────────────────────────
function updateGutter(editor, gutter, errorLine = 0) {
  const lines = editor.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= lines; i++) {
    const errClass = i === errorLine ? ' error-line' : '';
    html += `<div class="gutter-line${errClass}">${i}</div>`;
  }
  gutter.innerHTML = html;

  // Sync scroll
  gutter.scrollTop = editor.scrollTop;
}

// ── Syntax highlighting (live in textarea via contenteditable approach)
// Since we use <textarea>, we do status-bar indicators instead of inline hl.

// ── JSON parse & validate ─────────────────────────────────────────
/**
 * Approximate the error line when the engine gives no position info
 * (e.g. Safari "JSON Parse error: Unexpected identifier").
 * Checks each line for the most common JSON mistakes.
 */
function jsonApproxErrorLine(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;
    // Unquoted key:  word: ...
    if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*:/.test(t)) return i + 1;
    // Single-quoted string
    if (/'[^']*'/.test(raw)) return i + 1;
    // Trailing comma before } or ]
    if (/,\s*[}\]]/.test(raw)) return i + 1;
    // JS-style comments
    if (/^\s*(\/\/|\/\*)/.test(raw)) return i + 1;
    // Bare value / identifier
    if (/^\s*[A-Za-z_$][A-Za-z0-9_$]*\s*$/.test(t)) return i + 1;
  }
  return 0;
}

function parseGrammar(text) {
  try {
    const obj = JSON.parse(text);
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Grammar must be a JSON object');
    }
    return { ok: true, obj };
  } catch (e) {
    const msg = e.message;
    let errorLine = 0;
    let loc = '';

    // Chrome/Node (V8): "... at position N"
    const posMatch = msg.match(/\bat position\s+(\d+)/i);
    // Firefox / Chrome old: "... at line N column M of the JSON data"
    const lineColMatch = msg.match(/\bat line\s+(\d+)\s+col(?:umn)?\s+(\d+)/i);
    // Generic "line N" fallback
    const lineOnlyMatch = !lineColMatch && msg.match(/\bline\s+(\d+)/i);

    if (posMatch) {
      const pos = Number(posMatch[1]);
      errorLine = getLineFromOffset(text, pos);
      loc = ` (line ${errorLine}, position ${pos})`;
    } else if (lineColMatch) {
      errorLine = Number(lineColMatch[1]) || 0;
      const col = Number(lineColMatch[2]) || 0;
      loc = ` (line ${errorLine}, column ${col})`;
    } else if (lineOnlyMatch) {
      errorLine = Number(lineOnlyMatch[1]) || 0;
      loc = ` (line ${errorLine})`;
    } else {
      // No position in error message (Safari, some Chrome variants).
      // Scan each line for common JSON mistakes.
      errorLine = jsonApproxErrorLine(text);
      if (errorLine > 0) loc = ` (around line ${errorLine})`;
    }

    return { ok: false, error: msg + loc, errorLine };
  }
}

// ── Render output ─────────────────────────────────────────────────
function setOriginInputValidity(valid) {
  if (!originInput) return;
  originInput.classList.toggle('invalid', !valid);
}

function render() {
  if (!shadowRoot) return;
  const outputEl = shadowRoot.getElementById('output');

  if (!lastValidGrammar) {
    outputEl.textContent = '⚠ Fix grammar errors to see output.';
    setOriginInputValidity(true);
    return;
  }

  // Warn if the origin symbol doesn't exist in the grammar
  if (!(originSymbol in lastValidGrammar)) {
    const keys = Object.keys(lastValidGrammar).filter(k => !k.startsWith('_'));
    const suggestions = keys.slice(0, 6).map(k => `<code>${k}</code>`).join(', ');
    outputEl.innerHTML = `<div class="origin-warning">
      <strong>⚠ Symbol not found: <code>${originSymbol}</code></strong>
      <p>There is no symbol named <code>${originSymbol}</code> in your grammar.</p>
      <p>Available symbols: ${suggestions}${keys.length > 6 ? ` and ${keys.length - 6} more…` : ''}</p>
      <p>Change the origin name above to one of these, or add <code>"${originSymbol}"</code> to your grammar.</p>
    </div>`;
    shadowRoot.getElementById('user-style').textContent = cssText;
    setOriginInputValidity(false);
    return;
  }

  setOriginInputValidity(true);

  try {
    const grammar = createGrammar(lastValidGrammar);
    const result = grammar.flatten('#' + originSymbol + '#');

    if (isLikelyHTML(result)) {
      outputEl.innerHTML = sanitizeHTML(result);
    } else {
      outputEl.textContent = result;
    }

    // Apply user CSS
    shadowRoot.getElementById('user-style').textContent = cssText;

    rerollCount++;
    if (rerollStat) rerollStat.textContent = `↺ ${rerollCount}`;
  } catch (e) {
    outputEl.textContent = `Runtime error: ${e.message}`;
  }
}

function getSharableCompiledState() {
  const parsed = parseGrammar(grammarEditor.value);
  if (!parsed.ok) {
    return { ok: false };
  }

  const candidate = cloneGrammarWithEmbeddedCss(parsed.obj, cssText);

  try {
    const compiled = createGrammar(candidate);
    if (!compiled?.symbols?.[originSymbol]) {
      return { ok: false };
    }

    compiled.flatten('#' + originSymbol + '#');
    if (Array.isArray(compiled.errors) && compiled.errors.length > 0) {
      return { ok: false };
    }

    return { ok: true, grammar: candidate };
  } catch {
    return { ok: false };
  }
}

/**
 * Push a real history entry so the user can press Back to recover prior state.
 * Called before loading an example or a file — creates the recovery checkpoint.
 */
async function pushHistoryCheckpoint() {
  const state = getSharableCompiledState();
  if (!state.ok) return;
  const urlStr = await buildShareURL(state.grammar);
  const u = new URL(urlStr);
  if (originSymbol !== 'origin') u.searchParams.set('o', originSymbol);
  if (editorsHidden) u.searchParams.set('v', 'wide');
  window.history.pushState(null, '', u.toString());
}

async function syncUrlToCurrentState() {
  const state = getSharableCompiledState();
  if (!state.ok) {
    return false;
  }

  const urlStr = await buildShareURL(state.grammar);
  // Preserve the origin param when it's not the default
  if (originSymbol !== 'origin') {
    const u = new URL(urlStr);
    u.searchParams.set('o', originSymbol);
    window.history.replaceState(null, '', u.toString());
  } else {
    window.history.replaceState(null, '', urlStr);
  }
  markSaved();
  return true;
}

function scheduleAutoUrlSync() {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  const version = ++autoSyncVersion;
  autoSyncTimer = setTimeout(async () => {
    if (version !== autoSyncVersion) {
      return;
    }

    try {
      await syncUrlToCurrentState();
    } catch (error) {
      console.warn('Auto URL sync failed', error);
    }
  }, 300);
}

// ── Grammar change handler ────────────────────────────────────────
function onGrammarChange() {
  const text = grammarEditor.value;
  updateGutter(grammarEditor, grammarGutter);
  updateSyntaxHighlighting('grammar');
  syncHighlightScroll(grammarEditor, grammarHighlight);

  const result = parseGrammar(text);
  if (result.ok) {
    grammarObj = result.obj;
    lastValidGrammar = result.obj;

    hideError();
    updateStatus(true, Object.keys(result.obj).filter(k => !k.startsWith('_')).length);

    if (autoReroll) render();
    scheduleAutoUrlSync();
  } else {
    showError(result.error, result.errorLine || 0);
    updateStatus(false, 0);
  }

  markDirty();
  pushHistory(grammarHistory, grammarHistoryIdx, text, (h, i) => {
    grammarHistory = h; grammarHistoryIdx = i;
  });
}

// ── CSS change handler ────────────────────────────────────────────
function onCssChange() {
  const text = cssEditor.value;
  cssText = text;
  updateGutter(cssEditor, cssGutter);
  updateSyntaxHighlighting('css');
  syncHighlightScroll(cssEditor, cssHighlight);

  if (grammarObj) {
    lastValidGrammar = grammarObj;
  }

  if (autoReroll || true) {  // always apply CSS live
    if (shadowRoot) {
      shadowRoot.getElementById('user-style').textContent = cssText;
    }
  }

  scheduleAutoUrlSync();

  markDirty();
  pushHistory(cssHistory, cssHistoryIdx, text, (h, i) => {
    cssHistory = h; cssHistoryIdx = i;
  });
}
// ── History ───────────────────────────────────────────────────────
function pushHistory(arr, idx, val, setter) {
  const newArr = arr.slice(0, idx + 1);
  if (newArr[newArr.length - 1] === val) return;
  newArr.push(val);
  const newIdx = newArr.length - 1;
  setter(newArr, newIdx);
}

function handleUndo(editor, gutter) {
  if (editor === grammarEditor) {
    if (grammarHistoryIdx <= 0) return;
    grammarHistoryIdx--;
    grammarEditor.value = grammarHistory[grammarHistoryIdx];
    onGrammarChange();
  } else {
    if (cssHistoryIdx <= 0) return;
    cssHistoryIdx--;
    cssEditor.value = cssHistory[cssHistoryIdx];
    onCssChange();
  }
  if (editor === grammarEditor) {
    updateGutter(editor, gutter, 0);
  } else {
    updateGutter(editor, gutter);
  }
}

function handleRedo(editor, gutter) {
  if (editor === grammarEditor) {
    if (grammarHistoryIdx >= grammarHistory.length - 1) return;
    grammarHistoryIdx++;
    grammarEditor.value = grammarHistory[grammarHistoryIdx];
    onGrammarChange();
  } else {
    if (cssHistoryIdx >= cssHistory.length - 1) return;
    cssHistoryIdx++;
    cssEditor.value = cssHistory[cssHistoryIdx];
    onCssChange();
  }
  if (editor === grammarEditor) {
    updateGutter(editor, gutter, 0);
  } else {
    updateGutter(editor, gutter);
  }
}

// ── Status & error UI ─────────────────────────────────────────────
function showError(msg, errorLine = 0) {
  errorOverlay.textContent = '✗ ' + msg;
  errorOverlay.classList.add('visible');
  // Add bottom padding to grammar editor so all lines are visible above overlay
  grammarEditor.style.paddingBottom = '38px';
  grammarHighlight.style.paddingBottom = '38px';
  updateGutter(grammarEditor, grammarGutter, errorLine);
  if (statusValid) {
    statusValid.className = 'status-item error';
    statusValid.innerHTML = '<span class="dot red"></span> JSON error';
  }
}

function hideError() {
  errorOverlay.classList.remove('visible');
  grammarEditor.style.paddingBottom = '';
  grammarHighlight.style.paddingBottom = '';
}

function updateStatus(valid, symbolCount) {
  if (statusValid) {
    statusValid.className = 'status-item ' + (valid ? 'valid' : 'error');
    statusValid.innerHTML = valid
      ? `<span class="dot green"></span> Valid`
      : `<span class="dot red"></span> Error`;
  }
  if (statusSymbols) {
    statusSymbols.textContent = valid ? `${symbolCount} symbols` : '';
  }
}

function markDirty() {
  isDirty = true;
  saveIndicator.className = 'dirty';
  saveIndicator.innerHTML = '● unsaved';
}

function markSaved() {
  isDirty = false;
  saveIndicator.className = 'saved';
  saveIndicator.innerHTML = '✓ saved';
}

// ── Format JSON ───────────────────────────────────────────────────
function formatCss(raw) {
  let s = String(raw || '').trim();
  if (!s) return s;
  // Compress all whitespace
  s = s.replace(/\s+/g, ' ');
  // Insert newlines and indentation
  s = s.replace(/\s*\{\s*/g, ' {\n  ');
  s = s.replace(/;\s*/g, ';\n  ');
  s = s.replace(/\s*\}\s*/g, '\n}\n\n'); 
  // Cleanup
  s = s.replace(/\n\s*\n/g, '\n\n');
  s = s.replace(/  \n}/g, '\n}');
  return s.trim();
}

function formatGrammar() {
  const result = parseGrammar(grammarEditor.value);
  if (!result.ok) {
    showToast('Fix JSON errors before formatting');
    return;
  }
  const formatted = JSON.stringify(result.obj, null, 2);
  grammarEditor.value = formatted;
  grammarHistory.push(formatted);
  grammarHistoryIdx = grammarHistory.length - 1;
  onGrammarChange();

  // Also format the CSS editor
  if (cssEditor.value.trim()) {
    const formattedCss = formatCss(cssEditor.value);
    cssEditor.value = formattedCss;
    cssHistory.push(formattedCss);
    cssHistoryIdx = cssHistory.length - 1;
    onCssChange();
  }

  showToast('Formatted ✓');
}

// ── Load grammar into editors ─────────────────────────────────────
function loadGrammar(obj) {
  const displayGrammar = cloneGrammarWithoutEmbeddedCss(obj);
  grammarObj = displayGrammar;
  cssText = obj && typeof obj[CSS_EMBED_KEY] === 'string' ? obj[CSS_EMBED_KEY] : '';
  lastValidGrammar = displayGrammar;

  const jsonStr = JSON.stringify(displayGrammar, null, 2);
  grammarEditor.value = jsonStr;
  cssEditor.value = formatCss(cssText);

  grammarHistory = [jsonStr];
  grammarHistoryIdx = 0;
  cssHistory = [cssText];
  cssHistoryIdx = 0;

  updateGutter(grammarEditor, grammarGutter);
  updateGutter(cssEditor, cssGutter);
  updateSyntaxHighlighting('grammar');
  updateSyntaxHighlighting('css');
  syncHighlightScroll(grammarEditor, grammarHighlight);
  syncHighlightScroll(cssEditor, cssHighlight);
  hideError();
  updateStatus(true, Object.keys(obj).filter(k => !k.startsWith('_')).length);
  render();
  markSaved();
  // Update the URL to reflect the loaded grammar state
  scheduleAutoUrlSync();
}

// ── Save to file ──────────────────────────────────────────────────
function saveToFile() {
  const result = parseGrammar(grammarEditor.value);
  if (!result.ok) {
    showToast('Fix JSON errors before saving');
    return;
  }
  const obj = cloneGrammarWithEmbeddedCss(result.obj, cssText);
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'grammar.json';
  a.click();
  URL.revokeObjectURL(url);
  markSaved();
  showToast('Saved to grammar.json');
}

// ── Load from file ────────────────────────────────────────────────
function openFileDialog() {
  btnLoadFile.click();
}

function loadDefaultTemplate() {
  loadGrammar(cloneDefaultGrammar());
  scheduleAutoUrlSync();
  showToast('Loaded starter template');
}

function handleFileLoad(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      loadGrammar(obj);
      showToast('Loaded ' + file.name);
    } catch (err) {
      showToast('Invalid JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ── Share ─────────────────────────────────────────────────────────
async function shareGrammar() {
  const result = parseGrammar(grammarEditor.value);
  if (!result.ok) {
    showToast('Fix JSON errors before sharing');
    return;
  }
  const obj = cloneGrammarWithEmbeddedCss(result.obj, cssText);

  const url = await buildShareURL(obj);
  modalUrl.value = url;
  modalOverlay.classList.add('open');
  markSaved();
}

// ── Keyboard shortcuts ────────────────────────────────────────────
function editorKeydown(e, editor, gutter, onchange, undoFn, redoFn) {
  const isMac = navigator.platform.includes('Mac');
  const ctrl = isMac ? e.metaKey : e.ctrlKey;

  // Undo / Redo
  if (ctrl && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undoFn(editor, gutter);
    return;
  }
  if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redoFn(editor, gutter);
    return;
  }

  // Tab indent
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const val = editor.value;

    if (e.shiftKey) {
      // Outdent: remove up to 2 spaces from line start
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const toRemove = Math.min(2, val.slice(lineStart).match(/^ */)[0].length);
      if (toRemove > 0) {
        editor.value = val.slice(0, lineStart) + val.slice(lineStart + toRemove);
        editor.selectionStart = editor.selectionEnd = start - toRemove;
      }
    } else {
      editor.value = val.slice(0, start) + '  ' + val.slice(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
    }
    onchange();
    return;
  }

  // Wrap selection: " or ' or [ or {
  if (['"', "'", '[', '{'].includes(e.key)) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start !== end) {
      e.preventDefault();
      const pairs = { '"': '"', "'": "'", '[': ']', '{': '}' };
      const open = e.key;
      const close = pairs[e.key];
      const val = editor.value;
      const sel = val.slice(start, end);
      editor.value = val.slice(0, start) + open + sel + close + val.slice(end);
      editor.selectionStart = start + 1;
      editor.selectionEnd = end + 1;
      onchange();
      return;
    }
  }
}

// ── Drag and drop ────────────────────────────────────────────────
function setupDragDrop(editor) {
  editor.addEventListener('dragover', (e) => {
    e.preventDefault();
    editor.classList.add('drag-over');
  });
  editor.addEventListener('dragleave', () => editor.classList.remove('drag-over'));
  editor.addEventListener('drop', (e) => {
    e.preventDefault();
    editor.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      handleFileLoad(file);
    } else if (file) {
      showToast('Drop a .json file');
    }
  });
}

// ── Resize handles ────────────────────────────────────────────────
function setupResize() {
  resizeHandles.forEach(handle => {
    let startX, startY, startW, startH;
    const prev = handle.previousElementSibling;
    const next = handle.nextElementSibling;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      const isMobile = window.innerWidth <= 900;
      if (isMobile) {
        startH = prev.getBoundingClientRect().height;
      } else {
        startW = prev.getBoundingClientRect().width;
      }
      handle.classList.add('dragging');

      const onMove = (e) => {
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
          const dy = e.clientY - startY;
          const newH = Math.max(100, startH + dy);
          prev.style.flex = `0 0 ${newH}px`;
        } else {
          const dx = e.clientX - startX;
          const newW = Math.max(200, startW + dx);
          prev.style.flex = `0 0 ${newW}px`;
        }
      };

      const onUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}


// ── Examples ──────────────────────────────────────────────────────

const EXAMPLES = [
  // ── Tracery features ───────────────────────────────────────────
  {
    id: 'tracery-basics',
    category: 'Tracery',
    title: 'Symbols & Rules',
    description: 'Core Tracery: define symbols and reference them with #symbol# to build varied sentences.',
    grammar: {
      "origin": ["<p class='out'>#sentence#</p>", "<p class='out'>#sentence# #sentence#</p>"],
      "sentence": [
        "The #adj# #animal# #verb# across the #place#.",
        "A #adj# #animal# once told me: \"#phrase#\".",
        "Deep in the #place#, a #adj# #animal# was #verb#."
      ],
      "adj": ["mysterious", "ancient", "tiny", "glowing", "restless"],
      "animal": ["fox", "wolf", "moth", "raven", "tortoise"],
      "verb": ["wandered", "slept", "sang", "waited", "danced"],
      "place": ["silver forest", "ruined archive", "fog library", "quiet valley"],
      "phrase": ["nothing is ever lost", "keep moving forward", "every door opens twice"],
      "_cssStyles": ".out{font-family:Georgia,serif;font-size:1.15rem;line-height:1.9;padding:1.2rem;max-width:55ch;color:#2a2a2a}"
    }
  },
  {
    id: 'tracery-modifiers',
    category: 'Tracery',
    title: 'Modifiers',
    description: 'Use .capitalize, .s (plural) and .ed after a symbol to transform its output automatically.',
    grammar: {
      "origin": ["<div class='mod-demo'><h2>Modifiers in Action</h2>#example##example##example#</div>"],
      "example": [
        "<p><code>#animal#</code> → <b>#animal.capitalize#</b> <em>(capitalize)</em></p>",
        "<p><code>#animal#</code> → <b>#animal.s#</b> <em>(plural)</em></p>",
        "<p><code>#verb#</code> → <b>#verb.ed#</b> <em>(past tense)</em></p>",
        "<p><code>#adj#</code> → <b>#adj.capitalize#</b> <em>(capitalize)</em></p>"
      ],
      "animal": ["fox", "wolf", "moth", "raven", "dragon"],
      "verb": ["wander", "dance", "sleep", "run", "listen"],
      "adj": ["ancient", "mysterious", "gentle", "electric"],
      "_cssStyles": ".mod-demo{font-family:sans-serif;padding:1rem;max-width:55ch} h2{font-size:1.1rem;margin-bottom:.8rem} p{line-height:2;margin:.2rem 0;border-bottom:1px solid #eee;padding:.2rem 0} code{background:#f0f0f0;padding:1px 6px;border-radius:4px;font-size:.9em} em{color:#888;font-size:.9em}"
    }
  },
  {
    id: 'tracery-push-pop',
    category: 'Tracery',
    title: 'Set Variables',
    description: 'Use [name:#symbol#] inside a # expression to set a variable and reuse it consistently.',
    grammar: {
      "origin": ["#[hero:#name#][heroPet:#animal#]story#"],
      "story": [
        "<div class='tale'><h2>The Tale of #hero#</h2><p>#hero# had a pet #heroPet# named #heroPet.capitalize#-Too.</p><p>One day, #hero# and the #heroPet# ventured into the #place#.</p><p>Nobody believed #hero# when they returned — but the #heroPet# knew the truth.</p></div>"
      ],
      "name": ["Ash", "Ember", "River", "Sage", "Quinn", "Wren"],
      "animal": ["fox", "raven", "tortoise", "moth", "lynx"],
      "place": ["silver forest", "sunken archive", "glass canyon", "fog vale"],
      "_cssStyles": ".tale{font-family:Georgia,serif;padding:1.2rem;max-width:52ch;line-height:1.8} h2{font-size:1.3rem;margin-bottom:.6rem;color:#3a3a6a} p{margin:.5rem 0}"
    }
  },
  {
    id: 'tracery-nested',
    category: 'Tracery',
    title: 'Nested Symbols',
    description: 'Symbols can reference other symbols to build complex, layered outputs from simple rules.',
    grammar: {
      "origin": ["<div class='news'><h2>🗞 #headline#</h2><p>#lead#</p><p>#follow#</p></div>"],
      "headline": ["Local #creature.capitalize# #verb.ed# in #place#", "#place.capitalize# Shocked by #adj.capitalize# #creature.capitalize#", "#adj.capitalize# #creature.capitalize# to Attend #event#"],
      "lead": ["Witnesses described the #creature# as #adv# #adj#.", "Officials say the #creature# appeared on #day# without warning.", "The #adj# #creature# was first spotted near the old #place#."],
      "follow": ["No comment has been issued by the local #who#.", "#who.capitalize# is expected to hold a press conference on #day#.", "Further updates are expected from the #who# by end of week."],
      "creature": ["moth", "fox", "tortoise", "raven", "newt"],
      "adj": ["glowing", "enormous", "ancient", "confused", "tiny"],
      "adv": ["surprisingly", "visibly", "undeniably", "reportedly"],
      "verb": ["appear", "wander", "lecture", "vote", "escape"],
      "place": ["town hall", "the market", "city park", "the old mill"],
      "event": ["the annual gala", "a local festival", "the summit", "opening night"],
      "who": ["mayor", "committee", "council", "spokesperson"],
      "day": ["Monday", "Thursday", "next week", "this afternoon"],
      "_cssStyles": ".news{font-family:Georgia,serif;padding:1.2rem;max-width:55ch;border-left:4px solid #3a3a6a;line-height:1.8} h2{font-size:1.2rem;margin-bottom:.6rem;color:#3a3a6a} p{margin:.5rem 0;color:#333}"
    }
  },
  // ── HTML & CSS features ────────────────────────────────────────
  {
    id: 'text-decoration',
    category: 'Text Styles',
    title: 'Text Decoration',
    description: 'Bold, italic, underline, strikethrough and coloured text using HTML tags and inline CSS.',
    grammar: {
      "origin": ["<div class='story'><h2>#headline#</h2><p>#sentence#</p><p>#more#</p></div>"],
      "headline": ["Today's Story", "Breaking News", "A Short Tale"],
      "sentence": [
        "The <b>#adj#</b> explorer was <i>absolutely</i> <u>determined</u>.",
        "She had a <span class='col1'>#adj#</span> idea that changed everything.",
        "<b><i>Everyone agreed:</i></b> the plan was <s>terrible</s> brilliant."
      ],
      "more": [
        "Her notes were <mark>#adj#</mark> and full of <u>underlines</u>.",
        "The sign read: <span class='col2'>#adj# Zone — Proceed With Care</span>."
      ],
      "adj": ["mysterious", "ancient", "glowing", "tiny", "electric"],
      "_cssStyles": ".story{font-family:Georgia,serif;font-size:1rem;line-height:1.8;padding:1.2rem;max-width:52ch} h2{font-size:1.3rem;margin-bottom:.6rem} p{margin:.4rem 0} mark{background:rgb(255,241,118);padding:0 2px} .col1{color:crimson;font-weight:bold} .col2{color:royalblue;text-decoration:underline}"
    }
  },
  {
    id: 'text-alignment',
    category: 'Text Styles',
    title: 'Text Alignment',
    description: 'Left, centre, and right text alignment using CSS text-align.',
    grammar: {
      "origin": ["<div class='page'>#block#<br>#block#<br>#block#</div>"],
      "block": [
        "<p style='text-align:left'><b>Left:</b> #phrase#</p>",
        "<p style='text-align:center'><b>Centre:</b> #phrase#</p>",
        "<p style='text-align:right'><b>Right:</b> #phrase#</p>",
        "<p class='fancy'>#phrase#</p>"
      ],
      "phrase": ["The stars were bright.", "A fox ran past.", "Something strange happened.", "Nobody noticed."],
      "_cssStyles": ".page{font-family:sans-serif;font-size:1rem;line-height:2;padding:1rem;max-width:50ch} .fancy{text-align:center;font-style:italic;color:slateblue}"
    }
  },
  {
    id: 'headers-links',
    category: 'Structure',
    title: 'Headers & Links',
    description: 'HTML heading levels h1-h3, paragraphs, and anchor links.',
    grammar: {
      "origin": ["<article class='doc'><h1>#title#</h1><h2>#subtitle#</h2><p>#body#</p><p>Read more at <a href='https://example.com'>example.com</a></p></article>"],
      "title": ["The Great Discovery", "An Unexpected Journey", "Secrets of the Deep"],
      "subtitle": ["Chapter One: The Beginning", "Part One: Setting Off", "Introduction: What Lies Ahead"],
      "body": [
        "It all started on a <b>#adj#</b> afternoon when nobody expected anything unusual.",
        "The explorer opened the door and found something <i>#adj#</i> inside.",
        "Years of waiting finally paid off — the answer was <u>#adj#</u> simple."
      ],
      "adj": ["quiet", "strange", "golden", "electric", "forgotten"],
      "_cssStyles": ".doc{font-family:Georgia,serif;padding:1.2rem;max-width:55ch;line-height:1.7} h1{font-size:1.6rem;margin-bottom:.2rem} h2{font-size:1.1rem;color:dimgray;font-weight:normal;margin-bottom:.8rem} a{color:royalblue} p{margin:.5rem 0}"
    }
  },
  {
    id: 'images',
    category: 'Images',
    title: 'Images',
    description: 'Display images with custom width, height, border-radius and alignment.',
    grammar: {
      "origin": ["<div class='gallery'><h2>#caption#</h2>#img#<p>#desc#</p></div>"],
      "img": [
        "<img src='https://picsum.photos/seed/#seed#/400/250' width='400' height='250' alt='photo' class='photo'>",
        "<img src='https://picsum.photos/seed/#seed#/200/200' width='200' height='200' alt='photo' class='circle'>",
        "<img src='https://picsum.photos/seed/#seed#/500/200' width='500' height='200' alt='photo' class='banner'>"
      ],
      "seed": ["forest", "city", "ocean", "mountain", "sky", "river"],
      "caption": ["A Quiet Moment", "Into the Wild", "Urban Life", "The Horizon"],
      "desc": ["This photo captures something unexpected.", "Every image tells a story.", "Look closer — there is always more to see."],
      "_cssStyles": ".gallery{font-family:sans-serif;padding:1rem;text-align:center} h2{font-size:1.2rem;margin-bottom:.6rem} .photo{border-radius:8px;display:block;margin:0 auto} .circle{border-radius:50%;display:block;margin:0 auto} .banner{border-radius:4px;display:block;margin:0 auto;width:100%;height:auto}"
    }
  },
  {
    id: 'colors-backgrounds',
    category: 'Colors',
    title: 'Colors & Backgrounds',
    description: 'Change the page background, text colours and highlights using CSS class names.',
    grammar: {
      "origin": ["<div class='page bg-#theme#'><h1>#title#</h1><p>#body#</p></div>"],
      "theme": ["night", "day", "sunset"],
      "title": ["A Colourful World", "Design With Style", "Make It Pop"],
      "body": [
        "<span class='accent'>#phrase#</span> — colour makes all the difference.",
        "Try <b class='accent'>bold colour</b> to emphasise your ideas.",
        "A <span class='highlight'>#phrase#</span> stands out immediately."
      ],
      "phrase": ["this word", "a key idea", "the main point", "something important"],
      "_cssStyles": ".page{font-family:sans-serif;padding:1.5rem;max-width:52ch;line-height:1.8;border-radius:8px} .bg-night{background:rgb(26,26,46);color:rgb(224,224,224)} .bg-day{background:rgb(255,253,231);color:rgb(51,51,51)} .bg-sunset{background:rgb(255,112,67);color:rgb(255,243,224)} h1{margin-bottom:.6rem} .accent{color:gold;font-weight:bold} .highlight{background:rgba(255,255,100,0.4);padding:0 4px}"
    }
  },
  {
    id: 'layout-columns',
    category: 'Layout',
    title: 'Float Layout',
    description: 'Float elements left and right to create simple two-column layouts.',
    grammar: {
      "origin": ["<div class='page'><h2>#title#</h2><div class='row'><div class='left-col'>#left#</div><div class='right-col'>#right#</div><div class='clear'></div></div></div>"],
      "title": ["Two Column Layout", "Side by Side", "Float Example"],
      "left": ["<p><b>Left:</b> #phrase#</p><p>#phrase2#</p>"],
      "right": ["<p style='text-align:right'><b>Right:</b> #phrase#</p><p style='text-align:right;font-style:italic'>#phrase2#</p>"],
      "phrase": ["The quick fox jumped over the fence.", "Always check both sides of the argument.", "Details matter more than you think."],
      "phrase2": ["Consider every option.", "Think it through carefully.", "Look at the big picture."],
      "_cssStyles": ".page{font-family:sans-serif;padding:1rem;max-width:60ch} h2{margin-bottom:.8rem} .row{overflow:hidden} .left-col{float:left;width:48%;line-height:1.7} .right-col{float:right;width:48%;line-height:1.7} .clear{clear:both}"
    }
  },
  {
    id: 'table',
    category: 'Layout',
    title: 'Tables',
    description: 'Basic HTML tables with headers, rows and CSS styling.',
    grammar: {
      "origin": ["<div class='wrap'><h2>#title#</h2><table class='tbl'><thead><tr><th>Name</th><th>Type</th><th>Score</th></tr></thead><tbody>#row##row##row#</tbody></table></div>"],
      "title": ["High Scores", "Character Stats", "Creature Catalogue", "Mission Log"],
      "row": ["<tr><td>#name#</td><td>#type#</td><td>#score#</td></tr>"],
      "name": ["Ash", "Blaze", "Cedar", "Dusk", "Ember", "Frost"],
      "type": ["Explorer", "Builder", "Scout", "Keeper", "Watcher"],
      "score": ["92", "78", "85", "61", "99", "73"],
      "_cssStyles": ".wrap{font-family:sans-serif;padding:1rem} h2{margin-bottom:.6rem} .tbl{border-collapse:collapse;width:100%} .tbl th{background:rgb(58,58,106);color:white;padding:8px 12px;text-align:left} .tbl td{padding:8px 12px;border-bottom:1px solid rgb(221,221,221)} .tbl tr:nth-child(even) td{background:rgb(245,245,245)}"
    }
  },
  // ── Coherent-theme examples ────────────────────────────────────
  {
    id: 'scrollto-nav',
    category: 'Interactive',
    title: 'Scrolling Navigation',
    description: 'Use scrollto: followed by a CSS selector to create jump-links within the generated document. Great for long stories or encyclopedias. Notice the scroll-margin-top CSS so titles aren\'t trapped under the sticky nav!',
    grammar: {
      "origin": ["<main><nav><b>Contents:</b> <a href='scrollto:%23chap1'>Chap 1</a> | <a href='scrollto:%23chap2'>Chap 2</a> | <a href='scrollto:.footer'>Footer</a></nav> <section id='chap1'><h2>Chapter 1</h2><p>This is a long section. #content#</p></section> <section id='chap2'><h2>Chapter 2</h2><p>This is the second section. #content#</p></section> <footer class='footer'>The End <a href='scrollto:main'>↑ Top</a></footer></main>"],
      "content": ["Far far away, behind the word mountains, far from the countries Vokalia and Consonantia. ", "Separated they live in Bookmarksgrove right at the coast of the Semantics, a large language ocean. ", "A small river named Duden flows by their place and supplies it with the necessary regelialia. "],
      "_cssStyles": "main{font-family:sans-serif;max-width:40ch;padding:1rem;line-height:1.6} nav{position:sticky;top:0;background:#eef2ff;padding:1rem;border-radius:6px;margin-bottom:2rem;display:flex;gap:.5rem} section{min-height:80vh;scroll-margin-top:5rem} h2{color:slateblue;border-bottom:2px solid} footer{margin-top:4rem;padding:2rem;background:#334;color:#fff;text-align:center} a{color:royalblue;text-decoration:none;font-weight:bold} a:hover{text-decoration:underline}"
    }
  },

  {
    id: 'day-night-variables',
    category: 'Coherent Themes',
    title: 'Day & Night (Variables)',
    description: 'Use [var:#symbol#] to lock a time-of-day theme so creatures, light, and mood are always consistent within each generated story.',
    grammar: {
      "origin": [
        "#[time:day][skyWord:golden][animalPool:dayAnimal][ambiance:warm and still]scene#",
        "#[time:night][skyWord:silver][animalPool:nightAnimal][ambiance:cool and hushed]scene#"
      ],
      "scene": "<div class='tale'><h2>A #time# in the #place#</h2><p>The #skyWord# light lay across the #place#. The air was #ambiance#.</p><p>A <b>#animalPool#</b> moved through the undergrowth. #moment#</p><p class='close'>#close#</p></div>",
      "dayAnimal": ["fox", "deer", "hawk", "bumblebee", "robin"],
      "nightAnimal": ["owl", "moth", "bat", "firefly", "hedgehog"],
      "place": ["silver forest", "old meadow", "valley ridge", "riverside path"],
      "moment": [
        "For a long moment, nothing else moved.",
        "It paused, then continued on its way.",
        "The #place# felt like it was holding its breath."
      ],
      "close": [
        "By the time I looked again, it was gone.",
        "The #time# settled around it like a cloak.",
        "That is how I remember it: the #skyWord# light, the silence, and the #animalPool#."
      ],
      "_cssStyles": ".tale{font-family:Georgia,serif;padding:1.4rem;max-width:54ch;line-height:1.85} h2{font-size:1.25rem;color:slateblue;margin-bottom:.5rem} p{margin:.5rem 0} .close{font-style:italic;color:dimgray;margin-top:.8rem}"
    }
  },
  {
    id: 'day-night-structural',
    category: 'Coherent Themes',
    title: 'Day & Night (Structure)',
    description: 'A second approach: separate top-level symbols (dayStory, nightStory) each with their own themed word pools — no variables needed.',
    grammar: {
      "origin": ["#dayStory#", "#nightStory#"],
      "dayStory": "<div class='card day'><h2>☀ A #dayAdj# #dayTime#</h2><p>The #dayWeather# sky stretched wide. A <b>#dayAnimal#</b> crossed the #dayPlace#.</p><p>#dayMoment#</p></div>",
      "nightStory": "<div class='card night'><h2>🌙 A #nightAdj# #nightTime#</h2><p>The #nightWeather# sky was deep and wide. A <b>#nightAnimal#</b> moved through the #nightPlace#.</p><p>#nightMoment#</p></div>",
      "dayAdj": ["bright", "warm", "clear", "breezy", "golden"],
      "dayTime": ["morning", "afternoon", "noon", "sunrise"],
      "dayWeather": ["cloudless blue", "pale hazy", "brilliant white"],
      "dayAnimal": ["fox", "deer", "robin", "hawk", "bumblebee"],
      "dayPlace": ["open field", "sun-warmed hillside", "meadow path", "riverbank"],
      "dayMoment": ["The warmth made everything slow and easy.", "A distant lark sang once, then was quiet.", "Dust drifted in the sunlit air."],
      "nightAdj": ["still", "cool", "pale", "misty", "quiet"],
      "nightTime": ["midnight", "evening", "late hour", "small hours"],
      "nightWeather": ["star-scattered", "overcast", "moonlit"],
      "nightAnimal": ["owl", "moth", "bat", "firefly", "hedgehog"],
      "nightPlace": ["dark woodland", "moonlit clearing", "quiet lane", "fog-filled valley"],
      "nightMoment": ["Somewhere an owl called, once.", "The cold settled in gently.", "Nothing moved for a long while."],
      "_cssStyles": ".card{font-family:Georgia,serif;padding:1.4rem;max-width:54ch;line-height:1.85;border-radius:8px} .day{background:rgb(255,251,230);color:rgb(60,50,20)} .day h2{color:rgb(180,100,0)} .night{background:rgb(18,18,35);color:rgb(200,200,220)} .night h2{color:rgb(150,160,255)} p{margin:.5rem 0}"
    }
  },
  {
    id: 'seasons-structural',
    category: 'Coherent Themes',
    title: 'Four Seasons',
    description: 'Each season symbol draws only from season-appropriate imagery — a structural approach to thematic coherence without any variables.',
    grammar: {
      "origin": ["#spring#", "#summer#", "#autumn#", "#winter#"],
      "spring": "<div class='s spring'><h2>🌸 Spring</h2><p>#springOpening# A <b>#springCreature#</b> appeared among the #springPlant#.</p><p>#springClose#</p></div>",
      "summer": "<div class='s summer'><h2>☀ Summer</h2><p>#summerOpening# A <b>#summerCreature#</b> rested in the shade of the #summerPlant#.</p><p>#summerClose#</p></div>",
      "autumn": "<div class='s autumn'><h2>🍂 Autumn</h2><p>#autumnOpening# A <b>#autumnCreature#</b> moved beneath the #autumnPlant#.</p><p>#autumnClose#</p></div>",
      "winter": "<div class='s winter'><h2>❄ Winter</h2><p>#winterOpening# A <b>#winterCreature#</b> crossed the #winterPlace#.</p><p>#winterClose#</p></div>",
      "springOpening": ["The air smelled of rain and new growth.", "Everything was beginning again."],
      "springCreature": ["robin", "deer", "butterfly", "duckling"],
      "springPlant": ["bluebells", "fresh grass", "blossoming hedgerows"],
      "springClose": ["The world felt new and full of promise.", "Somewhere, something small was waking up."],
      "summerOpening": ["The heat pressed down like a warm hand.", "The day stretched out endlessly."],
      "summerCreature": ["fox", "grasshopper", "hawk", "bumblebee"],
      "summerPlant": ["tall oak", "wild roses", "bramble"],
      "summerClose": ["The afternoon refused to end.", "Even the breeze was warm."],
      "autumnOpening": ["The smell of woodsmoke drifted through the air.", "Leaves turned and dropped one by one."],
      "autumnCreature": ["squirrel", "raven", "hedgehog", "red deer"],
      "autumnPlant": ["copper beech", "bare oak", "rustling hawthorn"],
      "autumnClose": ["Something was ending, quietly and without fuss.", "The light came low and golden."],
      "winterOpening": ["The ground was hard underfoot.", "Cold had settled in overnight."],
      "winterCreature": ["fox", "heron", "fieldmouse", "barn owl"],
      "winterPlace": ["frozen field", "grey hillside", "snow-covered lane"],
      "winterClose": ["Silence was everywhere.", "The cold made everything sharp and clear."],
      "_cssStyles": ".s{font-family:Georgia,serif;padding:1.4rem;max-width:54ch;line-height:1.85;border-radius:8px;margin:.5rem} h2{font-size:1.2rem;margin-bottom:.5rem} p{margin:.4rem 0} .spring{background:rgb(240,255,245);color:rgb(30,60,40)} .spring h2{color:rgb(60,140,80)} .summer{background:rgb(255,251,220);color:rgb(60,50,20)} .summer h2{color:rgb(190,120,0)} .autumn{background:rgb(255,245,235);color:rgb(60,35,10)} .autumn h2{color:rgb(180,80,20)} .winter{background:rgb(235,240,255);color:rgb(20,30,55)} .winter h2{color:rgb(80,100,180)}"
    }
  },
  {
    id: 'setorigin-adventure',
    category: 'Interactive',
    title: 'Choose Your Path',
    description: 'Use setorigin: links to navigate between pages — click the links in the preview to move between scenes.',
    grammar: {
      "origin": ["<div class='page'><h2>🏚 The Old House</h2><p>You stand at the gate of an abandoned house. Rain falls softly. The front door is ajar. A path winds around the side.</p><nav><a href='setorigin:frontDoor'>Go through the front door →</a><a href='setorigin:garden'>Take the side path →</a></nav></div>"],
      "frontDoor": ["<div class='page'><h2>🚪 The Hallway</h2><p>Inside it is dark and quiet. A staircase leads up. A door leads toward the kitchen.</p><nav><a href='setorigin:upstairs'>Go upstairs →</a><a href='setorigin:kitchen'>Go to the kitchen →</a><a href='setorigin:origin'>← Back outside</a></nav></div>"],
      "garden": ["<div class='page'><h2>🌿 The Garden</h2><p>Overgrown and still. An old well sits at the centre. Something glints at the bottom, just out of reach.</p><nav><a href='setorigin:origin'>← Return to the gate</a></nav></div>"],
      "upstairs": ["<div class='page'><h2>🕯 The Upper Landing</h2><p>A long corridor. Doors on either side, all closed. At the far end, a light flickers under one of them.</p><nav><a href='setorigin:frontDoor'>← Back downstairs</a></nav></div>"],
      "kitchen": ["<div class='page'><h2>🍲 The Kitchen</h2><p>Cold and still. A pot on the stove. Through the cracked window you can see the overgrown garden.</p><nav><a href='setorigin:frontDoor'>← Back to the hallway</a><a href='setorigin:garden'>Step into the garden →</a></nav></div>"],
      "_cssStyles": ".page{font-family:Georgia,serif;max-width:50ch;padding:1.4rem;line-height:1.8} h2{font-size:1.2rem;margin-bottom:.6rem;color:slateblue} p{margin:.4rem 0;color:rgb(40,40,50)} nav{margin-top:1.2rem;display:flex;flex-direction:column;gap:.5rem} nav a{color:royalblue;text-decoration:none;font-size:.95rem;padding:.3rem 0;border-bottom:1px solid rgb(220,225,240)} nav a:hover{color:rgb(100,50,200)}"
    }
  },

    {
    id: 'full-page',
    category: 'Full Page',
    title: 'Mini Web Page',
    description: 'A complete styled page combining header, image, body text and footer.',
    grammar: {
      "origin": ["<div class='site'><header class='site-header'><h1>#title#</h1><p class='tagline'>#tagline#</p></header><main class='content'><img src='https://picsum.photos/seed/#seed#/600/240' width='600' height='240' alt='hero' class='hero-img'><p>#body#</p><p>#body#</p></main><footer class='site-footer'><p>#footer#</p></footer></div>"],
      "title": ["The Wanderer's Log", "Deep Sea Notes", "Sky Journal", "Forest Archive"],
      "tagline": ["Stories from beyond the map.", "Where curiosity leads.", "Notes from the edge of things."],
      "seed": ["ocean", "forest", "desert", "mountain", "sky"],
      "body": [
        "It was the kind of day that makes you want to stop and notice everything around you.",
        "Nobody had been here before — at least, that's what everyone assumed.",
        "The light shifted slowly, turning everything a shade of gold and possibility."
      ],
      "footer": ["Written with Tracery Studio.", "An experiment in generative writing.", "Made by a student, for everyone."],
      "_cssStyles": ".site{font-family:Georgia,serif;max-width:640px;margin:0 auto;color:rgb(34,34,34)} .site-header{background:rgb(44,62,80);color:white;padding:1.5rem;text-align:center} .site-header h1{font-size:1.8rem;margin:0 0 .3rem} .tagline{font-style:italic;color:rgb(170,170,170);margin:0} .content{padding:1.2rem;line-height:1.8} .hero-img{width:100%;height:auto;display:block;margin-bottom:1rem;border-radius:6px} .site-footer{background:rgb(236,240,241);padding:.8rem 1.2rem;font-size:.85rem;color:rgb(119,119,119);text-align:center} p{margin:.5rem 0}"
    }
  }
];

const examplesOverlay = document.getElementById('examples-overlay');
const examplesGrid = document.getElementById('examples-grid');
const examplesFilters = document.getElementById('examples-filters');
const btnExamplesClose = document.getElementById('btn-examples-close');

function openExamplesModal() {
  if (!examplesOverlay) return;
  renderExamplesGrid('all');
  examplesOverlay.classList.add('open');
}

function closeExamplesModal() {
  if (!examplesOverlay) return;
  examplesOverlay.classList.remove('open');
}

function renderExamplesGrid(activeFilter) {
  // Build filter buttons from categories
  const categories = ['all', ...new Set(EXAMPLES.map(e => e.category))];
  examplesFilters.innerHTML = categories.map(cat =>
    `<button class="ex-filter${cat === activeFilter ? ' active' : ''}" data-filter="${cat}">${cat === 'all' ? 'All' : cat}</button>`
  ).join('');

  examplesFilters.querySelectorAll('.ex-filter').forEach(btn => {
    btn.addEventListener('click', () => renderExamplesGrid(btn.dataset.filter));
  });

  // Build cards
  const shown = activeFilter === 'all' ? EXAMPLES : EXAMPLES.filter(e => e.category === activeFilter);
  examplesGrid.innerHTML = shown.map(ex => `
    <div class="ex-card" data-id="${ex.id}">
      <div class="ex-card-header">
        <span class="ex-badge">${ex.category}</span>
      </div>
      <h4 class="ex-title">${ex.title}</h4>
      <p class="ex-desc">${ex.description}</p>
      <button class="ex-load-btn" data-id="${ex.id}">Load Example</button>
    </div>
  `).join('');

  examplesGrid.querySelectorAll('.ex-load-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ex = EXAMPLES.find(e => e.id === btn.dataset.id);
      if (ex) {
        // Save current state as a back-button recovery point
        await pushHistoryCheckpoint();
        // Reset origin to this example's start symbol
        const exOrigin = ex.origin || 'origin';
        originSymbol = exOrigin;
        if (originInput) {
          originInput.value = exOrigin;
          setOriginInputValidity(true);
        }
        loadGrammar(ex.grammar);
        closeExamplesModal();
        showToast(`Loaded: ${ex.title}`);
      }
    });
  });
}


// ── Editor panel visibility ───────────────────────────────────────
let editorsHidden = false;
const btnToggleEditors = document.getElementById('btn-toggle-editors');
const iconEditorsHide = document.getElementById('icon-editors-hide');
const iconEditorsShow = document.getElementById('icon-editors-show');
const labelToggleEditors = document.getElementById('label-toggle-editors');

function applyEditorVisibility(hidden) {
  editorsHidden = hidden;
  const ws = document.getElementById('workspace');
  // The workspace is a 2-row named-area grid:
  //   grid-template-columns: <left> <preview>
  // Collapse by setting the left column to 0 and removing resize handles from flow.
  if (hidden) {
    ws.style.gridTemplateColumns = '0 1fr';
    document.querySelectorAll('#panel-grammar,#panel-css')
      .forEach(el => { el.style.visibility = 'hidden'; el.style.overflow = 'hidden'; });
    document.querySelectorAll('.resize-handle')
      .forEach(el => { el.style.display = 'none'; });
  } else {
    ws.style.gridTemplateColumns = '';
    document.querySelectorAll('#panel-grammar,#panel-css')
      .forEach(el => { el.style.visibility = ''; el.style.overflow = ''; });
    document.querySelectorAll('.resize-handle')
      .forEach(el => { el.style.display = ''; });
  }

  if (iconEditorsHide) iconEditorsHide.style.display = hidden ? 'none' : '';
  if (iconEditorsShow) iconEditorsShow.style.display = hidden ? '' : 'none';
  if (labelToggleEditors) labelToggleEditors.textContent = hidden ? 'Show Editors' : 'Hide Editors';

  // Persist to URL immediately (replaceState — not a checkpoint)
  const u = new URL(window.location.href);
  if (hidden) {
    u.searchParams.set('v', 'wide');
  } else {
    u.searchParams.delete('v');
  }
  window.history.replaceState(null, '', u.toString());
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {

  // Add syntax highlighting override toggle to settings
  if (settingsOverlay) {
    const row = document.createElement('label');
    row.className = 'settings-row';
    row.innerHTML = `<span>Disable syntax highlighting</span><input type="checkbox" id="force-disable-syntax-hl">`;
    settingsOverlay.querySelector('.modal.settings-modal .modal-actions').before(row);
    const cb = row.querySelector('#force-disable-syntax-hl');
    cb.checked = forceDisableSyntaxHighlighting;
    cb.addEventListener('change', e => setForceDisableSyntaxHighlighting(e.target.checked));
  }

  // Populate Help Documentation dynamically from the source of truth
  const elTags = document.getElementById('help-allowed-tags');
  if (elTags) elTags.textContent = Array.from(ALLOWED_TAGS).join(', ');
  
  const elCss = document.getElementById('help-allowed-css');
  if (elCss) elCss.textContent = Array.from(ALLOWED_CSS_PROPS).join(', ');
  
  const elAttrs = document.getElementById('help-allowed-attrs');
  if (elAttrs) elAttrs.textContent = Array.from(ALLOWED_ATTRS).join(', ');

  const initialTheme = getSavedThemePreference();
  applyThemePreference(initialTheme);
  saveThemePreference(initialTheme);

  initShadow();
  setupResize();
  setupDragDrop(grammarEditor);
  setupDragDrop(cssEditor);

  // Try loading from URL
  let initialGrammar = cloneDefaultGrammar();
  const urlGrammar = await loadFromURL();
  if (urlGrammar) {
    initialGrammar = urlGrammar;
    showToast('Loaded from URL ✓');
  }

  // Read view mode from URL (?v=wide hides editors)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('v') === 'wide') {
    applyEditorVisibility(true);
  }

  // Read origin symbol from URL (?o=)
  const originParam = urlParams.get('o');
  if (originParam && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(originParam)) {
    originSymbol = originParam;
  }
  if (originInput) {
    originInput.value = originSymbol;
  }

  loadGrammar(initialGrammar);

  // Origin input events
  if (originInput) {
    originInput.addEventListener('input', () => {
      const raw = originInput.value.trim();
      if (raw) {
        originSymbol = raw;
        render();
        // Always update ?o= immediately, independent of grammar validity
        const u = new URL(window.location.href);
        if (originSymbol !== 'origin') {
          u.searchParams.set('o', originSymbol);
        } else {
          u.searchParams.delete('o');
        }
        window.history.replaceState(null, '', u.toString());
        scheduleAutoUrlSync();
      }
    });
    originInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); render(); }
    });
  }

  // Grammar editor events
  grammarEditor.addEventListener('input', onGrammarChange);
  grammarEditor.addEventListener('keydown', (e) =>
    editorKeydown(e, grammarEditor, grammarGutter, onGrammarChange,
      () => handleUndo(grammarEditor, grammarGutter),
      () => handleRedo(grammarEditor, grammarGutter)));
  grammarEditor.addEventListener('scroll', () => {
    grammarGutter.scrollTop = grammarEditor.scrollTop;
    syncHighlightScroll(grammarEditor, grammarHighlight);
  });

  // CSS editor events
  cssEditor.addEventListener('input', onCssChange);
  cssEditor.addEventListener('keydown', (e) =>
    editorKeydown(e, cssEditor, cssGutter, onCssChange,
      () => handleUndo(cssEditor, cssGutter),
      () => handleRedo(cssEditor, cssGutter)));
  cssEditor.addEventListener('scroll', () => {
    cssGutter.scrollTop = cssEditor.scrollTop;
    syncHighlightScroll(cssEditor, cssHighlight);
  });

  // Button events
  btnReroll.addEventListener('click', () => render());
  btnFormat.addEventListener('click', formatGrammar);
  btnSave.addEventListener('click', saveToFile);
  btnLoad.addEventListener('click', openFileDialog);
  if (btnExamples) {
    btnExamples.addEventListener('click', openExamplesModal);
  }
  if (btnToggleEditors) {
    btnToggleEditors.addEventListener('click', () => applyEditorVisibility(!editorsHidden));
  }
  if (btnSettings) {
    btnSettings.addEventListener('click', openSettingsModal);
  }
  btnShare.addEventListener('click', shareGrammar);

  btnLoadFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
    pushHistoryCheckpoint().catch(() => {});
    handleFileLoad(file);
  }
    e.target.value = '';
  });

  autoRerollCb.addEventListener('change', (e) => {
    autoReroll = e.target.checked;
    if (autoReroll) render();
  });

  // Modal
  btnModalClose.addEventListener('click', () => modalOverlay.classList.remove('open'));

  // Examples modal close
  if (btnExamplesClose) {
    btnExamplesClose.addEventListener('click', closeExamplesModal);
  }
  if (examplesOverlay) {
    examplesOverlay.addEventListener('click', (e) => {
      if (e.target === examplesOverlay) closeExamplesModal();
    });
  }
  btnModalCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(modalUrl.value)
      .then(() => showToast('URL copied!'))
      .catch(() => { modalUrl.select(); document.execCommand('copy'); showToast('Copied!'); });
    modalOverlay.classList.remove('open');
  });
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('open');
  });

  if (settingsThemeSelect) {
    settingsThemeSelect.addEventListener('change', (e) => {
      const theme = e.target.value;
      applyThemePreference(theme);
      saveThemePreference(theme);
      showToast('Theme: ' + theme);
    });
  }

  if (btnSettingsClose) {
    btnSettingsClose.addEventListener('click', closeSettingsModal);
  }

  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) {
        closeSettingsModal();
      }
    });
  }

  if (btnHelp) {
    btnHelp.addEventListener('click', openHelpModal);
  }
  if (btnHelpClose) {
    btnHelpClose.addEventListener('click', closeHelpModal);
  }
  if (helpOverlay) {
    helpOverlay.addEventListener('click', (e) => {
      if (e.target === helpOverlay) {
        closeHelpModal();
      }
    });
  }

  // Undo/Redo buttons
  document.getElementById('btn-undo-grammar').addEventListener('click', () => handleUndo(grammarEditor, grammarGutter));
  document.getElementById('btn-redo-grammar').addEventListener('click', () => handleRedo(grammarEditor, grammarGutter));
  document.getElementById('btn-undo-css').addEventListener('click', () => handleUndo(cssEditor, cssGutter));
  document.getElementById('btn-redo-css').addEventListener('click', () => handleRedo(cssEditor, cssGutter));

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsOverlay && settingsOverlay.classList.contains('open')) {
      closeSettingsModal();
      return;
    }
    if (e.key === 'Escape' && helpOverlay && helpOverlay.classList.contains('open')) {
      closeHelpModal();
      return;
    }

    const isMac = navigator.platform.includes('Mac');
    const ctrl = isMac ? e.metaKey : e.ctrlKey;
    if (ctrl && e.key === 'Enter') { e.preventDefault(); render(); }
    if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); formatGrammar(); }
    if (ctrl && e.key === 's') { e.preventDefault(); saveToFile(); }
  });

  updateSyntaxHighlighting('grammar');
  updateSyntaxHighlighting('css');
}

document.addEventListener('DOMContentLoaded', init);
