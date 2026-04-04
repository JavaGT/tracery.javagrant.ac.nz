function safeParseJson(rawValue, fallback) {
    try {
        return JSON.parse(rawValue);
    } catch (error) {
        return fallback;
    }
}

export function loadStateFromStorage(storage, key, normalizeState) {
    const raw = storage.getItem(key);
    if (!raw) {
        return null;
    }

    const parsed = safeParseJson(raw, null);
    if (!parsed || typeof parsed !== "object") {
        return null;
    }

    return normalizeState(parsed);
}

export function saveStateToStorage(storage, key, state) {
    storage.setItem(key, JSON.stringify(state));
}

export function loadFileLibrary(storage, key) {
    const raw = storage.getItem(key);
    if (!raw) {
        return [];
    }

    const parsed = safeParseJson(raw, []);
    if (!Array.isArray(parsed)) {
        return [];
    }

    const cleaned = [];
    for (let index = 0; index < parsed.length; index += 1) {
        const item = parsed[index];
        if (!item || typeof item !== "object") {
            continue;
        }
        if (typeof item.name !== "string" || !item.name.trim()) {
            continue;
        }

        cleaned.push({
            name: item.name.trim(),
            savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
            state: item.state && typeof item.state === "object" ? item.state : {}
        });
    }

    return cleaned;
}

export function saveFileLibrary(storage, key, entries) {
    storage.setItem(key, JSON.stringify(Array.isArray(entries) ? entries : []));
}
