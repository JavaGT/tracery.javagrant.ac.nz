const DEFAULT_LIMITS = {
    maxEncodedChars: 200000,
    maxCompressedBytes: 150000,
    maxDecodedBytes: 1000000
};

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlToBytes(base64Url) {
    let base64 = String(base64Url || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
        base64 += "=";
    }
    return base64ToBytes(base64);
}

function mergeLimits(overrides) {
    return { ...DEFAULT_LIMITS, ...(overrides || {}) };
}

function ensureEncodedLength(candidate, limits) {
    if (candidate.length > limits.maxEncodedChars) {
        throw new Error("URL state is too large to decode safely.");
    }
}

function ensureByteLength(bytes, maxBytes, message) {
    if (bytes.length > maxBytes) {
        throw new Error(message);
    }
}

function decodeBytesToText(bytes, limits) {
    ensureByteLength(bytes, limits.maxDecodedBytes, "Decoded state is too large.");
    return new TextDecoder().decode(bytes);
}

async function compressTextToBase64Url(text, limits) {
    if (typeof CompressionStream !== "function") {
        throw new Error("This browser does not support compressed share URLs.");
    }

    const inputText = String(text || "");
    const textBytes = new TextEncoder().encode(inputText);
    ensureByteLength(textBytes, limits.maxDecodedBytes, "State is too large to share via URL.");

    const input = new Blob([inputText], { type: "text/plain" });
    const stream = input.stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    ensureByteLength(compressed, limits.maxCompressedBytes, "Compressed state is too large for URL sharing.");

    return bytesToBase64Url(compressed);
}

async function decompressTextFromBase64Url(encodedText, limits) {
    if (typeof DecompressionStream !== "function") {
        throw new Error("This browser does not support compressed share URLs.");
    }

    const compressed = base64UrlToBytes(encodedText);
    ensureByteLength(compressed, limits.maxCompressedBytes, "Compressed URL state is too large.");

    const input = new Blob([compressed], { type: "application/octet-stream" });
    const stream = input.stream().pipeThrough(new DecompressionStream("gzip"));
    const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());

    return decodeBytesToText(decompressed, limits);
}

function decodePlainTextFromBase64Url(encodedText, limits) {
    const bytes = base64UrlToBytes(encodedText);
    return decodeBytesToText(bytes, limits);
}

function decodePlainTextFromBase64(encodedText, limits) {
    const bytes = base64ToBytes(encodedText);
    return decodeBytesToText(bytes, limits);
}

export async function decodeStateTextFromUrlParam(encodedState, options) {
    const limits = mergeLimits(options);
    const rawValue = String(encodedState || "");
    const candidates = [rawValue];
    if (rawValue.includes(" ")) {
        candidates.push(rawValue.replace(/ /g, "+"));
    }

    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];

        try {
            ensureEncodedLength(candidate, limits);
            return await decompressTextFromBase64Url(candidate, limits);
        } catch (error) {
            lastError = error;
        }

        try {
            ensureEncodedLength(candidate, limits);
            return decodePlainTextFromBase64Url(candidate, limits);
        } catch (error) {
            lastError = error;
        }

        try {
            ensureEncodedLength(candidate, limits);
            return decodePlainTextFromBase64(candidate, limits);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Unable to decode URL state.");
}

export async function encodeStateTextForUrl(text, options) {
    const limits = mergeLimits(options);
    return compressTextToBase64Url(text, limits);
}
