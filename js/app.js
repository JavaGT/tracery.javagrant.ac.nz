import tracery from "./tracery/main.js";
import { decodeStateTextFromUrlParam, encodeStateTextForUrl } from "./services/stateCodec.js";
import { sanitizeHtml, enforceLinkBehavior } from "./services/outputSanitizer.js";
import {
    loadStateFromStorage as loadStateFromStorageRepo,
    saveStateToStorage as saveStateToStorageRepo,
    loadFileLibrary as loadFileLibraryEntries,
    saveFileLibrary as saveFileLibraryEntries
} from "./services/storageRepository.js";

const STORAGE_KEY = "traceryFocusedStateV2";
const FILE_LIBRARY_KEY = "traceryFileLibraryV1";
const SHARE_STATE_PARAM = "state";
const DEFAULT_CONFIG = {
    openLinksInNewTab: true,
    themePreference: "system",
    autoRerollOnType: false,
    layoutPresetIndex: 2,
    verticalSplitPresetIndex: 2
};
const LAYOUT_PRESETS = [
    { label: "0/100", bodyClass: "layout-e0-p100" },
    { label: "40/60", bodyClass: "layout-e40-p60" },
    { label: "50/50", bodyClass: "layout-e50-p50" },
    { label: "60/40", bodyClass: "layout-e60-p40" },
    { label: "100/0", bodyClass: "layout-e100-p0" }
];
const VERTICAL_SPLIT_PRESETS = [
    { label: "0/100", bodyClass: "vsplit-t0-c100" },
    { label: "40/60", bodyClass: "vsplit-t40-c60" },
    { label: "50/50", bodyClass: "vsplit-t50-c50" },
    { label: "60/40", bodyClass: "vsplit-t60-c40" },
    { label: "100/0", bodyClass: "vsplit-t100-c0" }
];

const defaultCustomGrammar = {
    "name": ["Arjun", "Yuuma", "Darcy", "Mia", "Chiaki", "Izzi", "Azra", "Lina"],
    "animal": ["unicorn", "raven", "sparrow", "scorpion", "coyote", "eagle", "owl", "lizard", "zebra", "duck", "kitten"],
    "mood": ["vexed", "indignant", "impassioned", "wistful", "astute", "courteous"],
    "story": ["#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#."],
    "origin": ["#[hero:#name#][heroPet:#animal#]story#"]
};
const DEFAULT_OUTPUT_CSS = [
    ".outputRoot {",
    "  background: lightpink;",
    "  color: white;",
    "  font-weight: bold;",
    "  padding: 1rem;",
    "}"
].join("\n");

let activeGrammar = null;
let appConfig = {
    openLinksInNewTab: DEFAULT_CONFIG.openLinksInNewTab,
    themePreference: DEFAULT_CONFIG.themePreference,
    autoRerollOnType: DEFAULT_CONFIG.autoRerollOnType,
    layoutPresetIndex: DEFAULT_CONFIG.layoutPresetIndex,
    verticalSplitPresetIndex: DEFAULT_CONFIG.verticalSplitPresetIndex
};
const EDITOR_HISTORY_LIMIT = 200;
const editorHistory = {
    json: { undo: [], redo: [], lastValue: null, applying: false },
    css: { undo: [], redo: [], lastValue: null, applying: false }
};

function byId(id) {
    return document.getElementById(id);
}

function setStatus(message, isError) {
    const statusEl = byId("jsonDebug");
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
}

function setCssStatus(message, isError) {
    const statusEl = byId("cssDebug");
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getSavedState() {
    const grammarText = getEditorText();
    const outputCssText = getOutputCssText();
    return {
        grammarText: getGrammarWithEmbeddedCssText(grammarText, outputCssText),
        outputCssText: outputCssText,
        config: appConfig
    };
}

function loadFileLibrary() {
    try {
        return loadFileLibraryEntries(localStorage, FILE_LIBRARY_KEY);
    } catch (error) {
        return [];
    }
}

function saveFileLibrary(entries) {
    saveFileLibraryEntries(localStorage, FILE_LIBRARY_KEY, entries);
}

function formatSavedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Unknown time";
    }

    return date.toLocaleString();
}

function normalizeLoadedState(parsed) {
    const loadedConfig = parsed && typeof parsed.config === "object" && parsed.config ? parsed.config : {};
    const themePreference = ["system", "light", "dark"].includes(loadedConfig.themePreference)
        ? loadedConfig.themePreference
        : DEFAULT_CONFIG.themePreference;
    const legacyLayoutIndex = loadedConfig.editorExpanded ? 0 : DEFAULT_CONFIG.layoutPresetIndex;
    const layoutPresetIndex = Number.isInteger(loadedConfig.layoutPresetIndex)
        && loadedConfig.layoutPresetIndex >= 0
        && loadedConfig.layoutPresetIndex < LAYOUT_PRESETS.length
        ? loadedConfig.layoutPresetIndex
        : legacyLayoutIndex;
    const verticalSplitPresetIndex = Number.isInteger(loadedConfig.verticalSplitPresetIndex)
        && loadedConfig.verticalSplitPresetIndex >= 0
        && loadedConfig.verticalSplitPresetIndex < VERTICAL_SPLIT_PRESETS.length
        ? loadedConfig.verticalSplitPresetIndex
        : DEFAULT_CONFIG.verticalSplitPresetIndex;
    const extracted = extractEmbeddedCssFromGrammarText(
        parsed.grammarText || "",
        parsed.outputCssText || DEFAULT_OUTPUT_CSS
    );

    return {
        grammarText: extracted.grammarText,
        outputCssText: extracted.cssText,
        config: {
            openLinksInNewTab: typeof loadedConfig.openLinksInNewTab === "boolean"
                ? loadedConfig.openLinksInNewTab
                : DEFAULT_CONFIG.openLinksInNewTab,
            themePreference: themePreference,
            autoRerollOnType: typeof loadedConfig.autoRerollOnType === "boolean"
                ? loadedConfig.autoRerollOnType
                : DEFAULT_CONFIG.autoRerollOnType,
            layoutPresetIndex: layoutPresetIndex,
            verticalSplitPresetIndex: verticalSplitPresetIndex
        }
    };
}

function getEditorElement() {
    return byId("customGrammarInput");
}

function getOutputCssElement() {
    return byId("outputCssInput");
}

function getOutputCssText() {
    const input = getOutputCssElement();
    return input ? normalizeEditorText(input.textContent) : "";
}

function getGrammarWithEmbeddedCssText(grammarText, cssText) {
    try {
        const parsed = parseJsonWithPosition(grammarText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return grammarText;
        }
        parsed.__cssForRenderer = String(cssText || "");
        return JSON.stringify(parsed, null, 2);
    } catch (error) {
        return grammarText;
    }
}

function extractEmbeddedCssFromGrammarText(grammarText, fallbackCss) {
    try {
        const parsed = parseJsonWithPosition(grammarText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {
                grammarText: grammarText,
                cssText: fallbackCss
            };
        }

        const extractedCss = typeof parsed.__cssForRenderer === "string"
            ? parsed.__cssForRenderer
            : fallbackCss;
        if (Object.prototype.hasOwnProperty.call(parsed, "__cssForRenderer")) {
            delete parsed.__cssForRenderer;
        }

        return {
            grammarText: JSON.stringify(parsed, null, 2),
            cssText: extractedCss
        };
    } catch (error) {
        return {
            grammarText: grammarText,
            cssText: fallbackCss
        };
    }
}

function getOutputHost() {
    return byId("output");
}

function getOutputShadowRoot() {
    const host = getOutputHost();
    if (!host) {
        return null;
    }
    if (!host.shadowRoot) {
        host.attachShadow({ mode: "open" });
    }
    return host.shadowRoot;
}

function logStartup(message, details) {
    if (typeof details === "undefined") {
        console.info("[Tracery startup] " + message);
        return;
    }
    console.info("[Tracery startup] " + message, details);
}

async function loadStateFromUrl() {
    const searchParams = new URLSearchParams(window.location.search);
    const encodedState = searchParams.get(SHARE_STATE_PARAM);
    if (!encodedState) {
        logStartup("No URL state found.");
        return null;
    }

    try {
        const stateJson = await decodeStateTextFromUrlParam(encodedState);
        const parsed = JSON.parse(stateJson);
        const normalized = normalizeLoadedState(parsed);
        logStartup("Loaded state from URL.", {
            encodedLength: encodedState.length,
            grammarChars: (normalized.grammarText || "").length,
            hasCss: Boolean((normalized.outputCssText || "").trim())
        });
        return normalized;
    } catch (error) {
        logStartup("Failed to parse URL state.", {
            encodedLength: encodedState.length,
            error: error && error.message ? error.message : String(error)
        });
        return null;
    }
}

function loadStateFromStorage() {
    try {
        const normalized = loadStateFromStorageRepo(localStorage, STORAGE_KEY, normalizeLoadedState);
        if (!normalized) {
            logStartup("No local storage state found.");
            return null;
        }

        logStartup("Loaded state from local storage.", {
            grammarChars: (normalized.grammarText || "").length,
            hasCss: Boolean((normalized.outputCssText || "").trim())
        });
        return normalized;
    } catch (error) {
        logStartup("Failed to parse local storage state.", {
            error: error && error.message ? error.message : String(error)
        });
        return null;
    }
}

function hasMeaningfulStoredWork(state) {
    return Boolean(state && typeof state.grammarText === "string" && state.grammarText.trim());
}

function getDefaultState() {
    return {
        grammarText: "",
        outputCssText: "",
        config: {
            openLinksInNewTab: DEFAULT_CONFIG.openLinksInNewTab,
            themePreference: DEFAULT_CONFIG.themePreference,
            autoRerollOnType: DEFAULT_CONFIG.autoRerollOnType,
            layoutPresetIndex: DEFAULT_CONFIG.layoutPresetIndex,
            verticalSplitPresetIndex: DEFAULT_CONFIG.verticalSplitPresetIndex
        }
    };
}

async function loadInitialState() {
    logStartup("Starting initial state resolution.");
    const sharedState = await loadStateFromUrl();
    const storedState = loadStateFromStorage();

    logStartup("State source availability.", {
        hasUrlState: Boolean(sharedState),
        hasStoredState: Boolean(storedState),
        hasMeaningfulStoredWork: hasMeaningfulStoredWork(storedState)
    });

    if (sharedState && hasMeaningfulStoredWork(storedState)) {
        const loadUrlState = window.confirm(
            "This page has saved state in both the URL and local storage.\n\n"
            + "Click OK to load the URL state.\n"
            + "Click Cancel to keep your local storage state.\n\n"
            + "If you load the URL state, your local storage work may be overwritten when you save. "
            + "To keep it, make a backup first by clicking Export JSON."
        );

        logStartup("User resolved URL vs local storage prompt.", {
            selectedSource: loadUrlState ? "url" : "storage"
        });

        return loadUrlState ? sharedState : storedState;
    }

    if (sharedState) {
        logStartup("Using URL state.");
        return sharedState;
    }

    if (storedState) {
        logStartup("Using local storage state.");
        return storedState;
    }

    logStartup("No saved state found; using defaults.");
    return getDefaultState();
}

async function saveStateToUrl() {
    const stateJson = JSON.stringify(getSavedState());
    const compressedState = await encodeStateTextForUrl(stateJson);
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_STATE_PARAM, compressedState);
    window.history.replaceState(null, "", url.toString());

    let copiedToClipboard = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
            await navigator.clipboard.writeText(url.toString());
            copiedToClipboard = true;
        } catch (error) {
            copiedToClipboard = false;
        }
    }

    return {
        url: url.toString(),
        copiedToClipboard: copiedToClipboard
    };
}
function normalizeEditorText(text) {
    return String(text || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n?/g, "\n");
}

function getEditorText() {
    const editor = getEditorElement();
    if (!editor) {
        return "";
    }
    return normalizeEditorText(editor.textContent);
}

function getSelectionOffsets(root) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        return null;
    }

    const startRange = range.cloneRange();
    startRange.selectNodeContents(root);
    startRange.setEnd(range.startContainer, range.startOffset);

    const endRange = range.cloneRange();
    endRange.selectNodeContents(root);
    endRange.setEnd(range.endContainer, range.endOffset);

    return {
        start: startRange.toString().length,
        end: endRange.toString().length
    };
}

function getNormalizedSelectionOffsets(root) {
    const selection = getSelectionOffsets(root);
    if (!selection) {
        return null;
    }
    return {
        start: Math.min(selection.start, selection.end),
        end: Math.max(selection.start, selection.end)
    };
}

function getNodeAtOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    let remaining = Math.max(0, offset);

    while (current) {
        const len = current.nodeValue.length;
        if (remaining <= len) {
            return { node: current, offset: remaining };
        }
        remaining -= len;
        current = walker.nextNode();
    }

    return { node: root, offset: root.childNodes.length };
}

function setSelectionOffsets(root, start, end) {
    const selection = window.getSelection();
    if (!selection) {
        return;
    }

    const safeStart = Math.max(0, start);
    const safeEnd = Math.max(safeStart, end);
    const startPos = getNodeAtOffset(root, safeStart);
    const endPos = getNodeAtOffset(root, safeEnd);
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    selection.removeAllRanges();
    selection.addRange(range);
}

function renderHtmlTagToken(tagText) {
    const parsed = /^<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*)>$/.exec(tagText);
    if (!parsed) {
        return escapeHtml(tagText);
    }

    const isClosing = parsed[1] === "/";
    const name = parsed[2];
    let attrSource = parsed[3] || "";
    const leadingSpace = (attrSource.match(/^\s*/) || [""])[0];
    const selfClosing = /\/\s*$/.test(attrSource);
    if (selfClosing) {
        attrSource = attrSource.replace(/\/\s*$/, "");
    }

    let out = "<span class=\"html-punct\">&lt;" + (isClosing ? "/" : "") + "</span>";
    out += "<span class=\"html-tag\">" + escapeHtml(name) + "</span>";
    if (leadingSpace) {
        out += escapeHtml(leadingSpace);
    }

    const attrRegex = /([:\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?(\s*)/g;
    let consumed = "";
    let attr;
    while ((attr = attrRegex.exec(attrSource)) !== null) {
        consumed += attr[0];
        out += "<span class=\"html-attr\">" + escapeHtml(attr[1]) + "</span>";
        if (typeof attr[2] === "string") {
            out += "<span class=\"html-punct\">=</span>";
            out += "<span class=\"html-attr-value\">" + escapeHtml(attr[2]) + "</span>";
        }
        if (attr[3]) {
            out += escapeHtml(attr[3]);
        }
    }

    if (attrSource && consumed.length < attrSource.length) {
        out += escapeHtml(attrSource.slice(consumed.length));
    }

    if (selfClosing) {
        out += "<span class=\"html-punct\">/</span>";
    }
    out += "<span class=\"html-punct\">&gt;</span>";
    return out;
}

function highlightHtmlInsideString(value) {
    const tagRegex = /<\/?[A-Za-z][^>]*>/g;
    let result = "";
    let last = 0;
    let match;
    while ((match = tagRegex.exec(value)) !== null) {
        result += escapeHtml(value.slice(last, match.index));
        result += renderHtmlTagToken(match[0]);
        last = match.index + match[0].length;
    }
    result += escapeHtml(value.slice(last));
    return result;
}

function highlightStringContent(value) {
    const source = String(value);
    let out = "";
    let cursor = 0;
    let i = 0;

    function flushPlain(until) {
        if (until > cursor) {
            out += escapeHtml(source.slice(cursor, until));
            cursor = until;
        }
    }

    while (i < source.length) {
        const ch = source[i];

        if (ch === "<") {
            const htmlMatch = /^<\/?[A-Za-z][^>]*>/.exec(source.slice(i));
            if (htmlMatch) {
                flushPlain(i);
                out += renderHtmlTagToken(htmlMatch[0]);
                i += htmlMatch[0].length;
                cursor = i;
                continue;
            }
        }

        if (ch === "[") {
            let j = i + 1;
            let depth = 1;
            while (j < source.length && depth > 0) {
                if (source[j] === "[") {
                    depth += 1;
                } else if (source[j] === "]") {
                    depth -= 1;
                }
                j += 1;
            }

            if (depth === 0) {
                const token = source.slice(i, j);
                flushPlain(i);
                out += "<span class=\"tracery-action\">" + escapeHtml(token) + "</span>";
                i = j;
                cursor = i;
                continue;
            }
        }

        if (ch === "#") {
            let j = i + 1;
            let bracketDepth = 0;
            while (j < source.length) {
                if (source[j] === "[") {
                    bracketDepth += 1;
                } else if (source[j] === "]" && bracketDepth > 0) {
                    bracketDepth -= 1;
                } else if (source[j] === "#" && bracketDepth === 0) {
                    j += 1;
                    break;
                }
                j += 1;
            }

            if (j <= source.length && j > i + 1 && source[j - 1] === "#") {
                const token = source.slice(i, j);
                flushPlain(i);
                out += "<span class=\"tracery-tag\">" + escapeHtml(token) + "</span>";
                i = j;
                cursor = i;
                continue;
            }
        }

        i += 1;
    }

    flushPlain(source.length);
    return out;
}

function renderStringToken(token, isKey) {
    if (isKey) {
        return "<span class=\"json-key\">" + escapeHtml(token) + "</span>";
    }

    try {
        const parsed = JSON.parse(token);
        if (typeof parsed === "string" && (/<\/?[A-Za-z][^>]*>|#[^#\n]+#|\[[^\[\]\n]+\]/.test(parsed))) {
            return "<span class=\"json-string\">&quot;" + highlightStringContent(parsed) + "&quot;</span>";
        }
    } catch (error) {
        // If token is invalid during typing, render raw escaped token.
    }

    return "<span class=\"json-string\">" + escapeHtml(token) + "</span>";
}

function highlightJsonToHtml(text) {
    const source = normalizeEditorText(text);
    const tokenRegex = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]/g;
    let output = "";
    let cursor = 0;
    let match;

    while ((match = tokenRegex.exec(source)) !== null) {
        const token = match[0];
        const index = match.index;
        output += escapeHtml(source.slice(cursor, index));

        if (token[0] === '"') {
            const trailing = source.slice(index + token.length);
            const isKey = /^\s*:/.test(trailing);
            output += renderStringToken(token, isKey);
        } else if (token === "true" || token === "false") {
            output += "<span class=\"json-boolean\">" + token + "</span>";
        } else if (token === "null") {
            output += "<span class=\"json-null\">null</span>";
        } else if (/^-?\d/.test(token)) {
            output += "<span class=\"json-number\">" + token + "</span>";
        } else {
            output += "<span class=\"json-punctuation\">" + escapeHtml(token) + "</span>";
        }

        cursor = index + token.length;
    }

    output += escapeHtml(source.slice(cursor));
    return output;
}

function setEditorText(text, restoreSelection) {
    const editor = getEditorElement();
    if (!editor) {
        return;
    }

    const nextText = normalizeEditorText(text);
    const selection = restoreSelection ? getSelectionOffsets(editor) : null;
    const scrollTop = editor.scrollTop;
    const scrollLeft = editor.scrollLeft;
    editor.innerHTML = highlightJsonToHtml(nextText);

    if (selection) {
        const length = nextText.length;
        setSelectionOffsets(
            editor,
            Math.min(selection.start, length),
            Math.min(selection.end, length)
        );
    }

    editor.scrollTop = scrollTop;
    editor.scrollLeft = scrollLeft;
}

function highlightCssToHtml(text) {
    const source = normalizeEditorText(text);
    let out = "";
    let i = 0;
    let depth = 0;
    let expectingProperty = false;
    let expectingValue = false;

    while (i < source.length) {
        const ch = source[i];

        if (ch === "/" && source[i + 1] === "*") {
            const end = source.indexOf("*/", i + 2);
            const comment = end === -1 ? source.slice(i) : source.slice(i, end + 2);
            out += "<span class=\"css-comment\">" + escapeHtml(comment) + "</span>";
            i += comment.length;
            continue;
        }

        if (ch === '"' || ch === "'") {
            const quote = ch;
            let j = i + 1;
            while (j < source.length) {
                if (source[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (source[j] === quote) {
                    j += 1;
                    break;
                }
                j += 1;
            }
            const str = source.slice(i, j);
            out += "<span class=\"css-value\">" + escapeHtml(str) + "</span>";
            i = j;
            continue;
        }

        if (ch === "{" || ch === "}" || ch === ":" || ch === ";") {
            out += "<span class=\"css-punctuation\">" + escapeHtml(ch) + "</span>";
            if (ch === "{") {
                depth += 1;
                expectingProperty = true;
                expectingValue = false;
            } else if (ch === "}") {
                depth = Math.max(0, depth - 1);
                expectingProperty = depth > 0;
                expectingValue = false;
            } else if (ch === ":") {
                expectingProperty = false;
                expectingValue = true;
            } else if (ch === ";") {
                expectingProperty = depth > 0;
                expectingValue = false;
            }
            i += 1;
            continue;
        }

        if (/[A-Za-z_\-]/.test(ch)) {
            let j = i + 1;
            while (j < source.length && /[A-Za-z0-9_\-]/.test(source[j])) {
                j += 1;
            }
            const token = source.slice(i, j);
            let cls = "";
            if (depth === 0) {
                cls = "css-selector";
            } else if (expectingProperty) {
                cls = "css-property";
            } else if (expectingValue) {
                cls = "css-value";
            }
            out += cls ? "<span class=\"" + cls + "\">" + escapeHtml(token) + "</span>" : escapeHtml(token);
            i = j;
            continue;
        }

        out += escapeHtml(ch);
        i += 1;
    }

    return out;
}

function setCssEditorText(text, restoreSelection) {
    const editor = getOutputCssElement();
    if (!editor) {
        return;
    }

    const nextText = normalizeEditorText(text);
    const selection = restoreSelection ? getSelectionOffsets(editor) : null;
    const scrollTop = editor.scrollTop;
    const scrollLeft = editor.scrollLeft;
    editor.innerHTML = highlightCssToHtml(nextText);

    if (selection) {
        const length = nextText.length;
        setSelectionOffsets(
            editor,
            Math.min(selection.start, length),
            Math.min(selection.end, length)
        );
    }

    editor.scrollTop = scrollTop;
    editor.scrollLeft = scrollLeft;
}

function updateCssLineNumbers(errorLine) {
    const input = getOutputCssElement();
    const lineNumbers = byId("cssLineNumbers");
    if (!input || !lineNumbers) {
        return;
    }

    const totalLines = Math.max(1, getOutputCssText().split("\n").length);
    let html = "";
    for (let i = 1; i <= totalLines; i++) {
        const errorClass = i === errorLine ? " errorLine" : "";
        html += "<div class=\"lineNum" + errorClass + "\">" + i + "</div>";
    }
    lineNumbers.innerHTML = html;
    lineNumbers.scrollTop = input.scrollTop;
}

function validateCssText(text) {
    const source = normalizeEditorText(text);
    const stack = [];
    let inComment = false;
    let inString = "";
    let escaped = false;
    let line = 1;
    let col = 1;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        if (ch === "\n") {
            line += 1;
            col = 1;
            continue;
        }

        if (inComment) {
            if (ch === "*" && next === "/") {
                inComment = false;
                i += 1;
                col += 2;
                continue;
            }
            col += 1;
            continue;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === inString) {
                inString = "";
            }
            col += 1;
            continue;
        }

        if (ch === "/" && next === "*") {
            inComment = true;
            i += 1;
            col += 2;
            continue;
        }

        if (ch === '"' || ch === "'") {
            inString = ch;
            col += 1;
            continue;
        }

        if (ch === "{") {
            stack.push({ line: line, column: col });
        } else if (ch === "}") {
            if (!stack.length) {
                return { line: line, column: col, message: "Unexpected closing brace '}'." };
            }
            stack.pop();
        }

        col += 1;
    }

    if (inComment) {
        return { line: line, column: col, message: "Unclosed CSS comment." };
    }
    if (inString) {
        return { line: line, column: col, message: "Unclosed CSS string." };
    }
    if (stack.length) {
        const opening = stack[stack.length - 1];
        return { line: opening.line, column: opening.column, message: "Unclosed CSS block '{'." };
    }
    return null;
}

function updateCssValidationHint() {
    const cssText = getOutputCssText();
    const issue = validateCssText(cssText);
    if (!issue) {
        updateCssLineNumbers(0);
        setCssStatus("CSS valid.", false);
        return true;
    }

    updateCssLineNumbers(issue.line);
    setCssStatus("CSS error at line " + issue.line + ", col " + issue.column + ": " + issue.message, true);
    return false;
}

function commitEditorMutation() {
    syncEditorHistory("json", getEditorText());
    saveState();
    updateJsonValidationHint();
    if (appConfig.autoRerollOnType) {
        tryAutoReroll();
    }
}

function commitCssEditorMutation() {
    syncEditorHistory("css", getOutputCssText());
    saveState();
    updateCssValidationHint();
    updateRenderedCssOnly();
}

function buildOutputStyleText(cssText) {
    return ""
        + ":host{display:block;height:100%;contain:content;background:transparent;color:inherit;font-family:inherit;}"
        + "*{box-sizing:border-box;}"
        + ".outputRoot{min-height:100%;padding:0;}"
        + cssText;
}

function updateRenderedCssOnly() {
    const outputRoot = getOutputShadowRoot();
    if (!outputRoot) {
        return false;
    }

    const styleNode = outputRoot.getElementById("outputScopedStyle");
    if (!styleNode) {
        return false;
    }

    styleNode.textContent = buildOutputStyleText(getOutputCssText());
    return true;
}

function syncEditorHistory(kind, currentValue) {
    const history = editorHistory[kind];
    if (!history || history.applying) {
        return;
    }

    const nextValue = String(currentValue || "");
    if (history.lastValue === null) {
        history.lastValue = nextValue;
        return;
    }

    if (history.lastValue === nextValue) {
        return;
    }

    history.undo.push(history.lastValue);
    if (history.undo.length > EDITOR_HISTORY_LIMIT) {
        history.undo.shift();
    }
    history.lastValue = nextValue;
    history.redo = [];
}

function resetEditorHistory(kind, value) {
    const history = editorHistory[kind];
    if (!history) {
        return;
    }

    history.undo = [];
    history.redo = [];
    history.lastValue = String(value || "");
    history.applying = false;
}

function applyEditorHistoryState(kind, nextValue, setTextFn, commitFn, editorEl) {
    const history = editorHistory[kind];
    if (!history) {
        return false;
    }

    history.applying = true;
    setTextFn(nextValue, false);
    setSelectionOffsets(editorEl, nextValue.length, nextValue.length);
    editorEl.focus();
    commitFn();
    history.lastValue = String(nextValue || "");
    history.applying = false;
    return true;
}

function undoEditor(kind, setTextFn, commitFn, editorEl) {
    const history = editorHistory[kind];
    if (!history || history.undo.length === 0) {
        return false;
    }

    const current = history.lastValue === null ? "" : history.lastValue;
    const previous = history.undo.pop();
    history.redo.push(current);
    return applyEditorHistoryState(kind, previous, setTextFn, commitFn, editorEl);
}

function redoEditor(kind, setTextFn, commitFn, editorEl) {
    const history = editorHistory[kind];
    if (!history || history.redo.length === 0) {
        return false;
    }

    const current = history.lastValue === null ? "" : history.lastValue;
    const next = history.redo.pop();
    history.undo.push(current);
    return applyEditorHistoryState(kind, next, setTextFn, commitFn, editorEl);
}

function isUndoShortcut(event) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return false;
    }
    return (event.key === "z" || event.key === "Z") && !event.shiftKey;
}

function isRedoShortcut(event) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return false;
    }
    const isShiftZ = (event.key === "z" || event.key === "Z") && event.shiftKey;
    const isY = (event.key === "y" || event.key === "Y") && !event.shiftKey;
    return isShiftZ || isY;
}

function insertNewlineInEditor(editor, getTextFn, setTextFn, commitFn) {
    const selection = getNormalizedSelectionOffsets(editor);
    if (!selection) {
        return false;
    }

    const text = getTextFn();
    const start = selection.start;
    const end = selection.end;
    const nextText = text.slice(0, start) + "\n" + text.slice(end);
    const caretOffset = start + 1;
    setTextFn(nextText, false);
    setSelectionOffsets(editor, caretOffset, caretOffset);
    editor.focus();
    commitFn();

    // Re-apply after the current frame so caret is correct even at EOF after re-render.
    requestAnimationFrame(function () {
        setSelectionOffsets(editor, caretOffset, caretOffset);
        editor.focus();
    });

    return true;
}

function formatCssText(text) {
    const source = normalizeEditorText(text);
    let out = "";
    let indent = 0;
    let inComment = false;
    let inString = "";
    let escaped = false;
    let suppressLeadingSourceSpace = true;

    function appendIndent() {
        out += "  ".repeat(Math.max(0, indent));
    }

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        if (inComment) {
            out += ch;
            if (ch === "*" && next === "/") {
                out += "/";
                i += 1;
                inComment = false;
            }
            if (ch === "\n") {
                suppressLeadingSourceSpace = true;
            }
            continue;
        }

        if (inString) {
            out += ch;
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === inString) {
                inString = "";
            }
            if (ch === "\n") {
                suppressLeadingSourceSpace = true;
            } else {
                suppressLeadingSourceSpace = false;
            }
            continue;
        }

        if ((ch === " " || ch === "\t") && suppressLeadingSourceSpace) {
            continue;
        }

        if (ch === "/" && next === "*") {
            inComment = true;
            out += "/*";
            i += 1;
            suppressLeadingSourceSpace = false;
            continue;
        }

        if (ch === '"' || ch === "'") {
            inString = ch;
            out += ch;
            suppressLeadingSourceSpace = false;
            continue;
        }

        if (ch === "{") {
            out = out.trimEnd() + " {\n";
            indent += 1;
            appendIndent();
            suppressLeadingSourceSpace = true;
            continue;
        }

        if (ch === "}") {
            out = out.trimEnd() + "\n";
            indent = Math.max(0, indent - 1);
            appendIndent();
            out += "}";
            suppressLeadingSourceSpace = false;
            if (source[i + 1] && source[i + 1] !== "\n") {
                out += "\n";
                appendIndent();
                suppressLeadingSourceSpace = true;
            }
            continue;
        }

        if (ch === ";") {
            out = out.trimEnd() + ";\n";
            appendIndent();
            suppressLeadingSourceSpace = true;
            continue;
        }

        if (ch === "\n" || ch === "\r" || ch === "\t") {
            suppressLeadingSourceSpace = true;
            continue;
        }

        out += ch;
        suppressLeadingSourceSpace = false;
    }

    return out.replace(/[ \t]+\n/g, "\n").trim() + "\n";
}

function formatCssInEditor() {
    const sourceText = getOutputCssText();
    const issue = validateCssText(sourceText);
    if (issue) {
        updateCssLineNumbers(issue.line);
        setCssStatus("Cannot format invalid CSS at line " + issue.line + ", col " + issue.column + ": " + issue.message, true);
        return false;
    }

    setCssEditorText(formatCssText(sourceText), false);
    updateCssLineNumbers(0);
    setCssStatus("CSS formatted.", false);
    return true;
}

function replaceEditorRange(start, end, replacement, nextStart, nextEnd) {
    const editor = getEditorElement();
    const current = getEditorText();
    const safeStart = Math.max(0, Math.min(start, current.length));
    const safeEnd = Math.max(safeStart, Math.min(end, current.length));
    const nextText = current.slice(0, safeStart) + replacement + current.slice(safeEnd);
    setEditorText(nextText, false);
    setSelectionOffsets(editor, nextStart, nextEnd);
    commitEditorMutation();
}

function wrapSelectedText(openToken, closeToken) {
    const editor = getEditorElement();
    const selection = getNormalizedSelectionOffsets(editor);
    if (!selection || selection.start === selection.end) {
        return false;
    }
    const text = getEditorText();
    const selected = text.slice(selection.start, selection.end);
    const replacement = openToken + selected + closeToken;
    replaceEditorRange(
        selection.start,
        selection.end,
        replacement,
        selection.start + openToken.length,
        selection.start + openToken.length + selected.length
    );
    return true;
}

function indentSelection(isOutdent) {
    const editor = getEditorElement();
    const selection = getNormalizedSelectionOffsets(editor);
    if (!selection) {
        return false;
    }

    const text = getEditorText();
    const start = selection.start;
    const end = selection.end;
    const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEndBreak = text.indexOf("\n", end);
    const lineEnd = lineEndBreak === -1 ? text.length : lineEndBreak;
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split("\n");

    if (!isOutdent) {
        const indentedLines = lines.map(function (line) {
            return "  " + line;
        });
        const replacement = indentedLines.join("\n");
        const addedPerLine = 2;
        const lineCount = lines.length;
        const nextStart = start + addedPerLine;
        const nextEnd = end + addedPerLine * lineCount;
        replaceEditorRange(lineStart, lineEnd, replacement, nextStart, nextEnd);
        return true;
    }

    const removedByLine = [];
    const outdentedLines = lines.map(function (line) {
        if (line.startsWith("\t")) {
            removedByLine.push(1);
            return line.slice(1);
        }
        if (line.startsWith("  ")) {
            removedByLine.push(2);
            return line.slice(2);
        }
        if (line.startsWith(" ")) {
            removedByLine.push(1);
            return line.slice(1);
        }
        removedByLine.push(0);
        return line;
    });

    const replacement = outdentedLines.join("\n");
    const removedBeforeStart = removedByLine[0] || 0;
    let removedInRange = 0;
    for (let i = 0; i < removedByLine.length; i++) {
        removedInRange += removedByLine[i];
    }
    const nextStart = Math.max(lineStart, start - removedBeforeStart);
    const nextEnd = Math.max(nextStart, end - removedInRange);
    replaceEditorRange(lineStart, lineEnd, replacement, nextStart, nextEnd);
    return true;
}

function handleEditorWrapShortcut(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
        return false;
    }

    const wraps = {
        '"': ['"', '"'],
        "'": ["'", "'"],
        "`": ["`", "`"],
        "#": ["##", "##"],
        "<": ["<", ">"],
        "(": ["(", ")"],
        "[": ["[", "]"],
        "{": ["{", "}"],
        "*": ["**", "**"],
        "_": ["_", "_"]
    };

    const pair = wraps[event.key];
    if (!pair) {
        return false;
    }

    return wrapSelectedText(pair[0], pair[1]);
}


function getLineStartOffset(text, lineNumber) {
    if (lineNumber <= 1) {
        return 0;
    }
    let line = 1;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
            line += 1;
            if (line === lineNumber) {
                return i + 1;
            }
        }
    }
    return text.length;
}

function offsetToLineColumn(text, offset) {
    const safeOffset = Math.max(0, Math.min(Number(offset) || 0, text.length));
    const before = text.slice(0, safeOffset);
    const line = before.split("\n").length;
    const lastBreak = before.lastIndexOf("\n");
    const column = safeOffset - (lastBreak + 1) + 1;
    return { line: line, column: column };
}

function createJsonParseError(text, offset, message) {
    const loc = offsetToLineColumn(text, offset);
    const error = new Error(message);
    error.offset = offset;
    error.position = offset;
    error.line = loc.line;
    error.column = loc.column;
    error.character = offset + 1;
    return error;
}

function parseJsonWithPosition(text) {
    const source = String(text || "");
    let i = 0;

    function peek() {
        return source[i];
    }

    function next() {
        return source[i++];
    }

    function skipWhitespace() {
        while (i < source.length) {
            const ch = source.charCodeAt(i);
            if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
                i += 1;
                continue;
            }
            break;
        }
    }

    function fail(message, atOffset) {
        throw createJsonParseError(source, typeof atOffset === "number" ? atOffset : i, message);
    }

    function expect(char) {
        if (peek() !== char) {
            fail("Expected '" + char + "'.");
        }
        i += 1;
    }

    function parseString() {
        expect('"');
        let out = "";
        while (i < source.length) {
            const ch = next();
            if (ch === '"') {
                return out;
            }
            if (ch === "\\") {
                if (i >= source.length) {
                    fail("Unterminated escape sequence in string.");
                }
                const esc = next();
                if (esc === '"' || esc === "\\" || esc === "/") {
                    out += esc;
                } else if (esc === "b") {
                    out += "\b";
                } else if (esc === "f") {
                    out += "\f";
                } else if (esc === "n") {
                    out += "\n";
                } else if (esc === "r") {
                    out += "\r";
                } else if (esc === "t") {
                    out += "\t";
                } else if (esc === "u") {
                    const hex = source.slice(i, i + 4);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                        fail("Invalid unicode escape in string.");
                    }
                    out += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                } else {
                    fail("Invalid escape character in string.");
                }
                continue;
            }

            const code = ch.charCodeAt(0);
            if (code <= 0x1F) {
                fail("Control character in string.", i - 1);
            }
            out += ch;
        }

        fail("Unterminated string.");
    }

    function parseNumber() {
        const start = i;
        if (peek() === "-") {
            i += 1;
        }

        if (peek() === "0") {
            i += 1;
        } else {
            if (!/[0-9]/.test(peek() || "")) {
                fail("Invalid number.", start);
            }
            while (/[0-9]/.test(peek() || "")) {
                i += 1;
            }
        }

        if (peek() === ".") {
            i += 1;
            if (!/[0-9]/.test(peek() || "")) {
                fail("Invalid number fraction.");
            }
            while (/[0-9]/.test(peek() || "")) {
                i += 1;
            }
        }

        if (peek() === "e" || peek() === "E") {
            i += 1;
            if (peek() === "+" || peek() === "-") {
                i += 1;
            }
            if (!/[0-9]/.test(peek() || "")) {
                fail("Invalid exponent in number.");
            }
            while (/[0-9]/.test(peek() || "")) {
                i += 1;
            }
        }

        const numText = source.slice(start, i);
        const num = Number(numText);
        if (!Number.isFinite(num)) {
            fail("Invalid number value.", start);
        }
        return num;
    }

    function parseLiteral(word, value) {
        if (source.slice(i, i + word.length) !== word) {
            fail("Unexpected token.");
        }
        i += word.length;
        return value;
    }

    function parseArray() {
        expect("[");
        skipWhitespace();
        const arr = [];
        if (peek() === "]") {
            i += 1;
            return arr;
        }

        while (i < source.length) {
            const value = parseValue();
            arr.push(value);
            skipWhitespace();
            const ch = peek();
            if (ch === ",") {
                i += 1;
                skipWhitespace();
                continue;
            }
            if (ch === "]") {
                i += 1;
                return arr;
            }
            fail("Expected ',' or ']'.");
        }

        fail("Unterminated array.");
    }

    function parseObject() {
        expect("{");
        skipWhitespace();
        const obj = {};
        if (peek() === "}") {
            i += 1;
            return obj;
        }

        while (i < source.length) {
            if (peek() !== '"') {
                fail("Expected string key.");
            }
            const key = parseString();
            skipWhitespace();
            expect(":");
            skipWhitespace();
            obj[key] = parseValue();
            skipWhitespace();
            const ch = peek();
            if (ch === ",") {
                i += 1;
                skipWhitespace();
                continue;
            }
            if (ch === "}") {
                i += 1;
                return obj;
            }
            fail("Expected ',' or '}'.");
        }

        fail("Unterminated object.");
    }

    function parseValue() {
        skipWhitespace();
        const ch = peek();
        if (ch === '"') {
            return parseString();
        }
        if (ch === "{") {
            return parseObject();
        }
        if (ch === "[") {
            return parseArray();
        }
        if (ch === "t") {
            return parseLiteral("true", true);
        }
        if (ch === "f") {
            return parseLiteral("false", false);
        }
        if (ch === "n") {
            return parseLiteral("null", null);
        }
        if (ch === "-" || /[0-9]/.test(ch || "")) {
            return parseNumber();
        }
        fail("Unexpected token.");
    }

    skipWhitespace();
    const value = parseValue();
    skipWhitespace();
    if (i !== source.length) {
        fail("Unexpected trailing characters.");
    }
    return value;
}

function extractJsonErrorLocation(text, error) {
    const message = String((error && error.message) || "");

    const propertyLine = Number(error && (error.lineNumber || error.line));
    const propertyColumn = Number(error && (error.columnNumber || error.column));
    const propertyPosition = Number(error && (error.position || error.at));

    if (Number.isFinite(propertyLine) && propertyLine > 0) {
        const line = propertyLine;
        const column = Number.isFinite(propertyColumn) && propertyColumn > 0 ? propertyColumn : 1;
        const offset = getLineStartOffset(text, line) + Math.max(0, column - 1);
        return {
            line: line,
            column: column,
            offset: offset,
            character: offset + 1
        };
    }

    if (Number.isFinite(propertyPosition) && propertyPosition >= 0) {
        const converted = offsetToLineColumn(text, propertyPosition);
        return {
            line: converted.line,
            column: converted.column,
            offset: propertyPosition,
            character: propertyPosition + 1
        };
    }

    const lineColumn = /line\s+(\d+)\s*(?:,|\s+)\s*(?:col(?:umn)?\s*)?(\d+)/i.exec(message)
        || /at\s+line\s+(\d+)\s+column\s+(\d+)/i.exec(message)
        || /line\s*[:=]\s*(\d+)\D+column\s*[:=]\s*(\d+)/i.exec(message);
    if (lineColumn) {
        const line = Number(lineColumn[1]);
        const column = Number(lineColumn[2]);
        const offset = getLineStartOffset(text, line) + Math.max(0, column - 1);
        return {
            line: line,
            column: column,
            offset: offset,
            character: offset + 1
        };
    }

    const position = /position\s+(\d+)/i.exec(message)
        || /at\s+character\s+(\d+)/i.exec(message)
        || /char\s+(\d+)/i.exec(message);
    if (position) {
        const offset = Number(position[1]);
        const converted = offsetToLineColumn(text, offset);
        return {
            line: converted.line,
            column: converted.column,
            offset: offset,
            character: offset + 1
        };
    }

    return null;
}

function updateJsonValidationHint() {
    const text = getEditorText();
    try {
        parseJsonWithPosition(text);
        updateLineNumbers(0);
    } catch (error) {
        const location = extractJsonErrorLocation(text, error);
        updateLineNumbers(location ? location.line : 0);
    }
}

function setJsonParseError(error, text, prefixMessage) {
    const location = extractJsonErrorLocation(text, error);
    if (!location) {
        setStatus((prefixMessage || "Invalid grammar JSON") + ": " + error.message, true);
        return false;
    }

    updateLineNumbers(location.line);
    focusJsonError(location);
    setStatus(
        (prefixMessage || "JSON parse error") +
        " at line " + location.line +
        ", col " + location.column +
        ", char " + location.character +
        ": " + error.message,
        true
    );
    return true;
}

function updateLineNumbers(errorLine) {
    const input = getEditorElement();
    const lineNumbers = byId("lineNumbers");
    if (!input || !lineNumbers) {
        return;
    }

    const totalLines = Math.max(1, getEditorText().split("\n").length);
    let html = "";
    for (let i = 1; i <= totalLines; i++) {
        const errorClass = i === errorLine ? " errorLine" : "";
        html += "<div class=\"lineNum" + errorClass + "\">" + i + "</div>";
    }
    lineNumbers.innerHTML = html;
    lineNumbers.scrollTop = input.scrollTop;
}

function focusJsonError(location) {
    const input = getEditorElement();
    const lineNumbers = byId("lineNumbers");
    if (!input || !location) {
        return;
    }

    const text = getEditorText();
    const start = Math.max(0, Math.min(location.offset, text.length));
    const end = Math.min(text.length, start + 1);
    input.focus();
    setSelectionOffsets(input, start, end);
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 18;
    input.scrollTop = Math.max(0, (location.line - 2) * lineHeight);
    if (lineNumbers) {
        lineNumbers.scrollTop = input.scrollTop;
    }
}

function saveState() {
    const grammarText = getEditorText();
    const outputCssText = getOutputCssText();
    saveStateToStorageRepo(localStorage, STORAGE_KEY, {
        grammarText: getGrammarWithEmbeddedCssText(grammarText, outputCssText),
        outputCssText: outputCssText,
        config: appConfig
    });
}

function tryAutoReroll() {
    if (!appConfig.autoRerollOnType) {
        return;
    }

    try {
        const parsed = parseGrammarText(getEditorText());
        activeGrammar = tracery.createGrammar(parsed);
        renderOne();
    } catch (error) {
        // Ignore invalid/incomplete JSON while typing.
    }
}

function applyThemePreference(preference) {
    if (preference === "light" || preference === "dark") {
        document.documentElement.setAttribute("data-theme", preference);
    } else {
        document.documentElement.removeAttribute("data-theme");
    }
}

function exportJsonFile() {
    const text = getGrammarWithEmbeddedCssText(getEditorText(), getOutputCssText());
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tracery-grammar-" + new Date().toISOString().replace(/[:]/g, "-") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Exported JSON file.", false);
}

function parseGrammarText(text) {
    const parsed = parseJsonWithPosition(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Grammar must be a JSON object.");
    }
    if (!parsed.origin) {
        throw new Error("Grammar must contain an origin symbol.");
    }
    return parsed;
}

function formatJsonInEditor() {
    const sourceText = getEditorText();

    try {
        const parsed = parseJsonWithPosition(sourceText);
        setEditorText(JSON.stringify(parsed, null, 2), false);
        updateLineNumbers(0);
        return true;
    } catch (error) {
        setJsonParseError(error, sourceText, "Cannot save invalid JSON");
        return false;
    }
}

function renderOne() {
    if (!activeGrammar) {
        setStatus("Apply a valid grammar first.", true);
        return;
    }

    const outputHost = getOutputHost();
    const outputRoot = getOutputShadowRoot();
    if (!outputHost || !outputRoot) {
        return;
    }

    const sample = activeGrammar.flatten("#origin#");
    const cssText = getOutputCssText();
    const contentHtml = sanitizeHtml(sample);

    outputRoot.innerHTML = ""
        + "<style id=\"outputScopedStyle\">"
        + buildOutputStyleText(cssText)
        + "</style>"
        + "<div class=\"outputRoot\">"
        + contentHtml
        + "</div>";

    outputHost.setAttribute("data-rendered", "1");
    enforceLinkBehavior(outputRoot, appConfig.openLinksInNewTab);
}

function applyGrammar() {
    updateLineNumbers(0);
    try {
        const text = getEditorText();
        const parsed = parseGrammarText(text);
        activeGrammar = tracery.createGrammar(parsed);
        saveState();
        renderOne();
        setStatus("JSON valid. Grammar applied.", false);
    } catch (error) {
        const inputText = getEditorText();
        if (!setJsonParseError(error, inputText, "Invalid grammar JSON")) {
            setStatus("Invalid grammar JSON: " + error.message, true);
        }
    }
}

function loadGrammarText(text) {
    const nextText = String(text || "").trim();
    if (!nextText) {
        setStatus("JSON file is empty.", true);
        return;
    }

    try {
        const extracted = extractEmbeddedCssFromGrammarText(nextText, getOutputCssText() || DEFAULT_OUTPUT_CSS);
        parseGrammarText(extracted.grammarText);
        setEditorText(extracted.grammarText, false);
        setCssEditorText(extracted.cssText, false);
        updateCssLineNumbers(0);
        updateCssValidationHint();
        applyGrammar();
        setStatus("Loaded grammar from JSON file.", false);
    } catch (error) {
        setStatus("Could not load JSON: " + error.message, true);
    }
}

function handleJsonFile(file) {
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = function () {
        loadGrammarText(String(reader.result || ""));
    };
    reader.onerror = function () {
        setStatus("Failed to read JSON file.", true);
    };
    reader.readAsText(file);
}

function openConfigModal() {
    byId("configModal").classList.remove("isHidden");
}

function closeConfigModal() {
    byId("configModal").classList.add("isHidden");
}

function applyLayoutPresetState() {
    for (let i = 0; i < LAYOUT_PRESETS.length; i++) {
        document.body.classList.remove(LAYOUT_PRESETS[i].bodyClass);
    }

    const preset = LAYOUT_PRESETS[appConfig.layoutPresetIndex] || LAYOUT_PRESETS[DEFAULT_CONFIG.layoutPresetIndex];
    document.body.classList.add(preset.bodyClass);

    const toggleButton = byId("toggleEditorSize");
    if (toggleButton) {
        const label = toggleButton.querySelector("span");
        if (label) {
            label.textContent = "Layout: " + preset.label;
        } else {
            toggleButton.textContent = "Layout: " + preset.label;
        }
    }
}

function applyVerticalSplitPresetState() {
    for (let i = 0; i < VERTICAL_SPLIT_PRESETS.length; i++) {
        document.body.classList.remove(VERTICAL_SPLIT_PRESETS[i].bodyClass);
    }

    const preset = VERTICAL_SPLIT_PRESETS[appConfig.verticalSplitPresetIndex]
        || VERTICAL_SPLIT_PRESETS[DEFAULT_CONFIG.verticalSplitPresetIndex];
    document.body.classList.add(preset.bodyClass);

    const button = byId("toggleVerticalSplit");
    if (button) {
        const label = button.querySelector("span");
        if (label) {
            label.textContent = "VSplit: " + preset.label;
        } else {
            button.textContent = "VSplit: " + preset.label;
        }
    }
}

document.addEventListener("DOMContentLoaded", function () {
    (async function initializeApp() {
        const grammarInput = getEditorElement();
        const outputCssInput = getOutputCssElement();
        const dropZone = byId("editorDropZone");
        const fileInput = byId("jsonFileInput");
        const openFileManager = byId("openFileManager");
        const fileManagerModal = byId("fileManagerModal");
        const closeFileManager = byId("closeFileManager");
        const refreshFileLibrary = byId("refreshFileLibrary");
        const saveFileEntry = byId("saveFileEntry");
        const fileManagerName = byId("fileManagerName");
        const fileManagerStatus = byId("fileManagerStatus");
        const fileLibraryList = byId("fileLibraryList");
        const openLinksInNewTab = byId("openLinksInNewTab");
        const themePreference = byId("themePreference");
        const autoRerollOnType = byId("autoRerollOnType");

        function setFileManagerStatus(message, isError) {
            if (!fileManagerStatus) {
                return;
            }
            fileManagerStatus.textContent = message;
            fileManagerStatus.classList.toggle("error", Boolean(isError));
        }

        function applyLoadedStateToUi(loadedState, sourceLabel, options) {
            const opts = options || {};
            const normalized = normalizeLoadedState(loadedState || {});
            appConfig = normalized.config;

            openLinksInNewTab.checked = appConfig.openLinksInNewTab;
            themePreference.value = appConfig.themePreference;
            autoRerollOnType.checked = appConfig.autoRerollOnType;
            applyLayoutPresetState();
            applyVerticalSplitPresetState();
            applyThemePreference(appConfig.themePreference);

            if (normalized.grammarText) {
                setEditorText(normalized.grammarText, false);
            } else {
                setEditorText(JSON.stringify(defaultCustomGrammar, null, 2), false);
            }
            setCssEditorText(normalized.outputCssText || DEFAULT_OUTPUT_CSS, false);
            resetEditorHistory("json", getEditorText());
            resetEditorHistory("css", getOutputCssText());
            updateLineNumbers(0);
            updateCssLineNumbers(0);
            updateCssValidationHint();
            applyGrammar();

            if (opts.persist !== false) {
                saveState();
            }
            if (opts.showStatus !== false) {
                setStatus("Loaded " + sourceLabel + ".", false);
            }
        }

        function getLibraryEntrySizeLabel(state) {
            const chars = state && typeof state.grammarText === "string"
                ? state.grammarText.length
                : 0;
            return chars + " chars";
        }

        function renderFileLibrary() {
            if (!fileLibraryList) {
                return;
            }

            const entries = loadFileLibrary().sort(function (a, b) {
                return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
            });

            fileLibraryList.innerHTML = "";
            if (!entries.length) {
                const empty = document.createElement("p");
                empty.className = "fileLibraryEmpty";
                empty.textContent = "No local files yet. Enter a name and click Save File.";
                fileLibraryList.appendChild(empty);
                return;
            }

            for (let i = 0; i < entries.length; i += 1) {
                const entry = entries[i];
                const row = document.createElement("div");
                row.className = "fileRow";

                const meta = document.createElement("div");
                meta.className = "fileMeta";

                const name = document.createElement("div");
                name.className = "fileName";
                name.textContent = entry.name;

                const info = document.createElement("div");
                info.className = "fileInfo";
                info.textContent = formatSavedAt(entry.savedAt) + " | " + getLibraryEntrySizeLabel(entry.state);

                meta.appendChild(name);
                meta.appendChild(info);

                const actions = document.createElement("div");
                actions.className = "fileActions";

                const loadButton = document.createElement("button");
                loadButton.type = "button";
                loadButton.textContent = "Load";
                loadButton.addEventListener("click", function () {
                    const shouldLoad = window.confirm("Load '" + entry.name + "'? This will replace the current editor content.");
                    if (!shouldLoad) {
                        return;
                    }

                    applyLoadedStateToUi(entry.state, "local file '" + entry.name + "'");
                    setFileManagerStatus("Loaded '" + entry.name + "'.", false);
                });

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.textContent = "Delete";
                deleteButton.addEventListener("click", function () {
                    const shouldDelete = window.confirm("Delete '" + entry.name + "' from local files?");
                    if (!shouldDelete) {
                        return;
                    }

                    const remaining = loadFileLibrary().filter(function (item) {
                        return item.name !== entry.name;
                    });
                    saveFileLibrary(remaining);
                    renderFileLibrary();
                    setFileManagerStatus("Deleted '" + entry.name + "'.", false);
                });

                actions.appendChild(loadButton);
                actions.appendChild(deleteButton);
                row.appendChild(meta);
                row.appendChild(actions);
                fileLibraryList.appendChild(row);
            }
        }

        function openFileManagerModal() {
            renderFileLibrary();
            setFileManagerStatus("", false);
            fileManagerModal.classList.remove("isHidden");
            fileManagerName.focus();
        }

        function closeFileManagerModal() {
            fileManagerModal.classList.add("isHidden");
        }

        const saved = await loadInitialState();
        applyLoadedStateToUi(saved, "saved state", { persist: false, showStatus: false });

        byId("applyCustomGrammar").addEventListener("click", applyGrammar);
        byId("saveWork").addEventListener("click", function () {
            if (!formatJsonInEditor()) {
                return;
            }
            saveState();
            setStatus("JSON formatted and saved to localStorage.", false);
        });
        byId("saveToUrl").addEventListener("click", async function () {
            if (!formatJsonInEditor()) {
                return;
            }

            saveState();
            try {
                const shareState = await saveStateToUrl();
                setStatus(shareState.copiedToClipboard
                    ? "Shareable URL updated and copied to clipboard."
                    : "Shareable URL updated.", false);
            } catch (error) {
                setStatus(error && error.message ? error.message : "Unable to create a shareable URL.", true);
            }
        });
        byId("formatJson").addEventListener("click", function () {
            if (!formatJsonInEditor()) {
                return;
            }
            saveState();
            setStatus("JSON formatted.", false);
        });
        byId("formatCss").addEventListener("click", function () {
            if (!formatCssInEditor()) {
                return;
            }
            saveState();
            if (!updateRenderedCssOnly()) {
                renderOne();
            }
        });
        byId("exportJson").addEventListener("click", exportJsonFile);
        byId("loadJsonButton").addEventListener("click", function () {
            fileInput.click();
        });
        openFileManager.addEventListener("click", openFileManagerModal);
        closeFileManager.addEventListener("click", closeFileManagerModal);
        refreshFileLibrary.addEventListener("click", function () {
            renderFileLibrary();
            setFileManagerStatus("Refreshed local file list.", false);
        });
        saveFileEntry.addEventListener("click", function () {
            const rawName = String(fileManagerName.value || "").trim();
            if (!rawName) {
                setFileManagerStatus("Enter a file name before saving.", true);
                return;
            }

            const entries = loadFileLibrary();
            const existingIndex = entries.findIndex(function (entry) {
                return entry.name.toLowerCase() === rawName.toLowerCase();
            });

            if (existingIndex >= 0) {
                const overwrite = window.confirm("A file named '" + entries[existingIndex].name + "' already exists. Overwrite it?");
                if (!overwrite) {
                    return;
                }
            }

            const snapshot = {
                name: rawName,
                savedAt: new Date().toISOString(),
                state: getSavedState()
            };

            if (existingIndex >= 0) {
                entries[existingIndex] = snapshot;
            } else {
                entries.push(snapshot);
            }

            saveFileLibrary(entries);
            renderFileLibrary();
            setFileManagerStatus("Saved '" + rawName + "' to local files.", false);
            setStatus("Saved local file '" + rawName + "'.", false);
        });
        fileManagerModal.addEventListener("click", function (event) {
            if (event.target === fileManagerModal) {
                closeFileManagerModal();
            }
        });
        byId("toggleEditorSize").addEventListener("click", function () {
            appConfig.layoutPresetIndex = (appConfig.layoutPresetIndex + 1) % LAYOUT_PRESETS.length;
            applyLayoutPresetState();
            saveState();
        });
        byId("toggleVerticalSplit").addEventListener("click", function () {
            appConfig.verticalSplitPresetIndex = (appConfig.verticalSplitPresetIndex + 1) % VERTICAL_SPLIT_PRESETS.length;
            applyVerticalSplitPresetState();
            saveState();
        });
        fileInput.addEventListener("change", function () {
            const file = fileInput.files && fileInput.files[0];
            handleJsonFile(file || null);
            fileInput.value = "";
        });

        dropZone.addEventListener("dragover", function (event) {
            event.preventDefault();
            dropZone.classList.add("dropActive");
        });
        dropZone.addEventListener("dragleave", function () {
            dropZone.classList.remove("dropActive");
        });
        dropZone.addEventListener("drop", function (event) {
            event.preventDefault();
            dropZone.classList.remove("dropActive");
            const files = event.dataTransfer && event.dataTransfer.files;
            if (!files || !files.length) {
                return;
            }
            handleJsonFile(files[0]);
        });

        byId("openConfig").addEventListener("click", openConfigModal);
        byId("closeConfig").addEventListener("click", closeConfigModal);
        byId("configModal").addEventListener("click", function (event) {
            if (event.target === byId("configModal")) {
                closeConfigModal();
            }
        });

        openLinksInNewTab.addEventListener("change", function () {
            appConfig.openLinksInNewTab = openLinksInNewTab.checked;
            saveState();
            renderOne();
        });

        themePreference.addEventListener("change", function () {
            appConfig.themePreference = themePreference.value;
            applyThemePreference(appConfig.themePreference);
            saveState();
        });

        autoRerollOnType.addEventListener("change", function () {
            appConfig.autoRerollOnType = autoRerollOnType.checked;
            saveState();
            tryAutoReroll();
        });

        grammarInput.addEventListener("input", function () {
            setEditorText(getEditorText(), true);
            commitEditorMutation();
        });
        grammarInput.addEventListener("scroll", function () {
            const lineNumbers = byId("lineNumbers");
            if (lineNumbers) {
                lineNumbers.scrollTop = grammarInput.scrollTop;
            }
        });
        outputCssInput.addEventListener("input", function () {
            setCssEditorText(getOutputCssText(), true);
            commitCssEditorMutation();
        });
        outputCssInput.addEventListener("scroll", function () {
            const lineNumbers = byId("cssLineNumbers");
            if (lineNumbers) {
                lineNumbers.scrollTop = outputCssInput.scrollTop;
            }
        });

        grammarInput.addEventListener("keydown", function (event) {
            if (isUndoShortcut(event)) {
                event.preventDefault();
                undoEditor("json", setEditorText, commitEditorMutation, grammarInput);
                return;
            }

            if (isRedoShortcut(event)) {
                event.preventDefault();
                redoEditor("json", setEditorText, commitEditorMutation, grammarInput);
                return;
            }

            if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                insertNewlineInEditor(grammarInput, getEditorText, setEditorText, commitEditorMutation);
                return;
            }

            if (event.key === "Tab") {
                event.preventDefault();
                indentSelection(event.shiftKey);
                return;
            }

            if (handleEditorWrapShortcut(event)) {
                event.preventDefault();
            }
        });

        outputCssInput.addEventListener("keydown", function (event) {
            if (isUndoShortcut(event)) {
                event.preventDefault();
                undoEditor("css", setCssEditorText, commitCssEditorMutation, outputCssInput);
                return;
            }

            if (isRedoShortcut(event)) {
                event.preventDefault();
                redoEditor("css", setCssEditorText, commitCssEditorMutation, outputCssInput);
                return;
            }

            if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                insertNewlineInEditor(outputCssInput, getOutputCssText, setCssEditorText, commitCssEditorMutation);
            }
        });

        document.addEventListener("keydown", function (event) {
            const isSaveShortcut = (event.key === "s" || event.key === "S") && (event.metaKey || event.ctrlKey);
            if (!isSaveShortcut) {
                return;
            }

            event.preventDefault();
            if (!formatJsonInEditor()) {
                return;
            }
            saveState();
            exportJsonFile();
        });

    })();
});
