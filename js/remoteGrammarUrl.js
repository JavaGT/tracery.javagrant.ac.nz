/**
 * Resolve common paste / repo URLs to a fetchable raw-JSON URL and load body text.
 * Gist “page” URLs use the GitHub API (CORS-friendly) to discover raw_url.
 */

function assertHttpUrl(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }
}

function isGistGithubPage(u) {
  return u.hostname.replace(/^www\./i, '').toLowerCase() === 'gist.github.com';
}

async function resolveGistPageToRawUrl(pageUrl) {
  const u = new URL(pageUrl);
  const parts = u.pathname.split('/').filter(Boolean);
  let gistId = '';
  if (parts.length >= 2) {
    gistId = parts[parts.length - 1];
  } else if (parts.length === 1) {
    gistId = parts[0];
  }
  if (!gistId || !/^[0-9a-f]{7,40}$|^\d+$/i.test(gistId)) {
    throw new Error('Could not read gist id from this URL');
  }

  const apiRes = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Accept: 'application/vnd.github+json' },
    mode: 'cors',
    credentials: 'omit'
  });
  const data = await apiRes.json().catch(() => ({}));
  if (!apiRes.ok) {
    throw new Error(data.message || `Gist request failed (${apiRes.status})`);
  }
  const files = data.files ? Object.values(data.files) : [];
  if (!files.length) {
    throw new Error('This gist has no files');
  }
  const jsonFile = files.find((f) => /\.json$/i.test(f.filename || ''));
  const pick = jsonFile || files[0];
  if (!pick.raw_url) {
    throw new Error('Gist file has no raw URL');
  }
  return pick.raw_url;
}

/**
 * Turn paste / file browser URLs into a direct raw URL (does not handle gist.github.com pages).
 */
export function normalizeRawGrammarUrl(trimmedInput) {
  const trimmed = (trimmedInput || '').trim();
  if (!trimmed) return null;

  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  assertHttpUrl(u);

  const host = u.hostname.replace(/^www\./i, '').toLowerCase();

  if (isGistGithubPage(u)) {
    return trimmed;
  }

  if (host === 'pastebin.com') {
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs[0] === 'raw' && segs[1]) {
      return `https://pastebin.com/raw/${segs[1]}`;
    }
    if (segs.length === 1 && /^[a-zA-Z0-9]+$/.test(segs[0])) {
      return `https://pastebin.com/raw/${segs[0]}`;
    }
    return trimmed;
  }

  if (host === 'hastebin.com') {
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs[0] !== 'raw' && segs.length === 1) {
      return `https://hastebin.com/raw/${segs[0]}`;
    }
    return trimmed;
  }

  if (host === 'rentry.co' || host === 'rentry.org') {
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length >= 1 && segs[segs.length - 1] !== 'raw') {
      return `${u.origin}/${segs[0]}/raw`;
    }
    return trimmed;
  }

  if (host === 'github.com') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (m) {
      const [, owner, repo, ref, rest] = m;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest}`;
    }
    return trimmed;
  }

  if (host === 'codeberg.org') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/src\/branch\/([^/]+)\/(.+)$/);
    if (m) {
      return `https://codeberg.org/${m[1]}/${m[2]}/raw/${m[3]}/${m[4]}`;
    }
    return trimmed;
  }

  if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) {
    const m = u.pathname.match(/^\/(.+?)\/-\/blob\/([^/]+)\/(.+)$/);
    if (m) {
      const proj = m[1];
      const ref = m[2];
      const path = m[3];
      return `${u.origin}/${proj}/-/raw/${ref}/${path}`;
    }
    return trimmed;
  }

  return trimmed;
}

export async function resolveGrammarFetchUrl(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new Error('Enter a URL');
  }

  let u;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL');
  }
  assertHttpUrl(u);

  if (isGistGithubPage(u)) {
    return resolveGistPageToRawUrl(trimmed);
  }

  const normalized = normalizeRawGrammarUrl(trimmed);
  if (!normalized) {
    throw new Error('Invalid URL');
  }
  return normalized;
}

export async function fetchGrammarTextFromRemote(input) {
  const fetchUrl = await resolveGrammarFetchUrl(input);
  const inner = new URL(fetchUrl);
  assertHttpUrl(inner);

  const res = await fetch(fetchUrl, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'follow'
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching document`);
  }

  let text = await res.text();
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text;
}
