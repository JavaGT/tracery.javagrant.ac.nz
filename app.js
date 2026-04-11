// ── Syntax Highlighting Override ───────────────────────────────
let forceDisableSyntaxHighlighting = false;

function setForceDisableSyntaxHighlighting(val) {
  forceDisableSyntaxHighlighting = !!val;
  updateSyntaxHighlighting('grammar');
  updateSyntaxHighlighting('css');
}
// app.js - Tracery Studio main application
import tracery from './js/old_tracery/main.js';
// Wrap createGrammar to automatically add the English modifiers required by tracery-grammar.
function createGrammar(obj) {
  const grammar = tracery.createGrammar(obj);
  grammar.addModifiers(tracery.baseEngModifiers);
  return grammar;
}
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
const settingsOverlay = document.getElementById('settings-overlay');
const settingsThemeSelect = document.getElementById('settings-theme-select');
const btnSettingsClose = document.getElementById('btn-settings-close');
const btnCopyEditor = document.getElementById('btn-copy-editor');
const btnCopyPreview = document.getElementById('btn-copy-preview');
const shareOriginInput = document.getElementById('share-origin-input');
const shareOriginStatus = document.getElementById('share-origin-status');

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
  if (!editor || !highlight) {
    return;
  }
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
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
      #output {
        min-height: 100%;
        min-width: 100%;
        position: fixed;
      }
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
    console.log(e)
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

async function updateShareModalPreviewUrl() {
  const result = parseGrammar(grammarEditor.value);
  if (!result.ok) return;

  const shareOrigin = (shareOriginInput.value || '').trim();
  const obj = cloneGrammarWithEmbeddedCss(result.obj, cssText);
  const params = {};
  
  const finalOrigin = shareOrigin || 'origin';
  if (finalOrigin !== 'origin') params.o = finalOrigin;
  // Preview URL defaults to Wide View as it is the primary action
  params.v = 'wide';

  const url = await buildShareURL(obj, params);
  modalUrl.value = url;
}

function validateShareOrigin() {
  const symbol = (shareOriginInput.value || '').trim();
  const status = shareOriginStatus;
  const input = shareOriginInput;
  
  updateShareModalPreviewUrl();

  if (!symbol) {
    status.style.display = 'none';
    input.style.borderColor = '';
    return true; 
  }

  const exists = lastValidGrammar && symbol in lastValidGrammar;
  status.style.display = 'block';
  
  if (exists) {
    status.textContent = '✓ Symbol exists in grammar';
    status.style.color = 'var(--color-success)';
    status.style.background = 'color-mix(in srgb, var(--color-success) 10%, transparent)';
    input.style.borderColor = 'var(--color-success)';
    return true;
  } else {
    status.textContent = '⚠ Symbol not found in grammar';
    status.style.color = 'var(--color-error)';
    status.style.background = 'color-mix(in srgb, var(--color-error) 10%, transparent)';
    input.style.borderColor = 'var(--color-error)';
    return false;
  }
}

async function copyShareUrl(viewMode = 'editor') {
  const result = parseGrammar(grammarEditor.value);
  if (!result.ok) {
    showToast('Fix JSON errors before sharing');
    return;
  }

  const shareOrigin = (shareOriginInput.value || '').trim();
  const obj = cloneGrammarWithEmbeddedCss(result.obj, cssText);
  const params = {};
  
  // Use the share-specific origin if provided, otherwise default to "origin"
  const finalOrigin = shareOrigin || 'origin';
  if (finalOrigin !== 'origin') params.o = finalOrigin;
  if (viewMode === 'wide') params.v = 'wide';

  const url = await buildShareURL(obj, params);
  
  try {
    await navigator.clipboard.writeText(url);
    showToast('URL copied!');
  } catch (err) {
    // Fallback for older browsers or non-secure contexts
    modalUrl.value = url;
    modalUrl.select();
    document.execCommand('copy');
    showToast('Copied!');
  }
  
  modalOverlay.classList.remove('open');
}

async function shareGrammar() {
  const result = parseGrammar(grammarEditor.value);
  if (!result.ok) {
    showToast('Fix JSON errors before sharing');
    return;
  }
  
  if (shareOriginInput) {
    shareOriginInput.value = originSymbol === 'origin' ? '' : originSymbol;
    validateShareOrigin();
  }
  
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

let EXAMPLES = [];


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

  try {
    const res = await fetch('examples.json');
    if (res.ok) {
      EXAMPLES = await res.json();
    }
  } catch (e) {
    console.error('Failed to load examples.json', e);
  }

  // Add syntax highlighting override toggle to settings
  if (settingsOverlay) {
    const row = document.createElement('label');
    row.className = 'settings-row';
    row.innerHTML = `<span>Disable syntax highlighting</span><input type="checkbox" id="force-disable-syntax-hl">`;
    settingsOverlay.querySelector('.settings-row').parentNode.appendChild(row);
    const cb = row.querySelector('#force-disable-syntax-hl');
    cb.checked = forceDisableSyntaxHighlighting;
    cb.addEventListener('change', e => setForceDisableSyntaxHighlighting(e.target.checked));

    // CSS override setting for underlying text areas
    const row2 = document.createElement('label');
    row2.className = 'settings-row';
    row2.innerHTML = `<span>Show raw editor text areas (CSS Override)</span><input type="checkbox" id="force-show-raw">`;
    settingsOverlay.querySelector('.settings-row').parentNode.appendChild(row2);
    const cb2 = row2.querySelector('#force-show-raw');
    cb2.addEventListener('change', e => document.body.classList.toggle('debug-show-textarea', e.target.checked));
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
      pushHistoryCheckpoint().catch(() => { });
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
  if (btnCopyEditor) {
    btnCopyEditor.addEventListener('click', () => copyShareUrl('editor'));
  }
  if (btnCopyPreview) {
    btnCopyPreview.addEventListener('click', () => copyShareUrl('wide'));
  }

  if (shareOriginInput) {
    shareOriginInput.addEventListener('input', () => {
      validateShareOrigin();
    });
  }

  btnModalClose.addEventListener('click', () => modalOverlay.classList.remove('open'));
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
