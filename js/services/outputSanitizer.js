const SAFE_HTML_TAGS = new Set([
    "p", "br", "strong", "em", "b", "i", "u", "s", "span", "div",
    "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
    "code", "pre", "a", "img", "figure", "figcaption", "hr", "table",
    "thead", "tbody", "tr", "th", "td"
]);

const SAFE_STYLE_PROPS = new Set([
    "color", "background-color", "font-weight", "font-style", "text-decoration",
    "text-align", "font-size", "line-height", "margin", "margin-top", "margin-right",
    "margin-bottom", "margin-left", "padding", "padding-top", "padding-right",
    "padding-bottom", "padding-left", "display", "width", "max-width", "height",
    "border", "border-radius", "list-style-type"
]);

function sanitizeStyle(styleValue) {
    const declarations = String(styleValue || "").split(";");
    const safe = [];

    for (let i = 0; i < declarations.length; i += 1) {
        const declaration = declarations[i].trim();
        if (!declaration) {
            continue;
        }

        const colon = declaration.indexOf(":");
        if (colon <= 0) {
            continue;
        }

        const prop = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim();
        if (!SAFE_STYLE_PROPS.has(prop)) {
            continue;
        }

        const lowerValue = value.toLowerCase();
        if (lowerValue.includes("javascript:") || lowerValue.includes("expression(") || lowerValue.includes("url(javascript:")) {
            continue;
        }

        safe.push(prop + ": " + value);
    }

    return safe.join("; ");
}

function isSafeUrl(urlValue, allowDataImage) {
    const value = String(urlValue || "").trim().toLowerCase();
    if (!value) {
        return false;
    }
    if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("#")) {
        return true;
    }
    if (allowDataImage && value.startsWith("data:image/")) {
        return true;
    }
    if (value.startsWith("mailto:")) {
        return true;
    }
    return false;
}

export function sanitizeHtml(input) {
    const parser = new DOMParser();
    const doc = parser.parseFromString("<div id=\"root\">" + input + "</div>", "text/html");
    const root = doc.getElementById("root");

    function cleanse(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            node.remove();
            return;
        }

        const tag = node.tagName.toLowerCase();
        if (!SAFE_HTML_TAGS.has(tag)) {
            const parent = node.parentNode;
            if (!parent) {
                return;
            }
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
            return;
        }

        const attrs = Array.from(node.attributes);
        for (let i = 0; i < attrs.length; i += 1) {
            const name = attrs[i].name.toLowerCase();
            const value = attrs[i].value;

            if (name.startsWith("on")) {
                node.removeAttribute(attrs[i].name);
                continue;
            }

            if (name === "style") {
                const cleanStyle = sanitizeStyle(value);
                if (cleanStyle) {
                    node.setAttribute("style", cleanStyle);
                } else {
                    node.removeAttribute("style");
                }
                continue;
            }

            if (tag === "a" && name === "href") {
                if (!isSafeUrl(value, false)) {
                    node.removeAttribute(attrs[i].name);
                }
                continue;
            }

            if (tag === "img" && name === "src") {
                if (!isSafeUrl(value, true)) {
                    node.removeAttribute(attrs[i].name);
                }
                continue;
            }

            const commonAllowed = ["class", "id", "title", "aria-label", "aria-hidden", "role"];
            const imageAllowed = ["alt", "width", "height", "loading", "decoding"];
            const linkAllowed = ["target", "rel"];

            if (commonAllowed.includes(name)) {
                continue;
            }
            if (tag === "img" && imageAllowed.includes(name)) {
                continue;
            }
            if (tag === "a" && linkAllowed.includes(name)) {
                continue;
            }

            node.removeAttribute(attrs[i].name);
        }

        const children = Array.from(node.childNodes);
        for (let i = 0; i < children.length; i += 1) {
            cleanse(children[i]);
        }
    }

    const rootChildren = Array.from(root.childNodes);
    for (let i = 0; i < rootChildren.length; i += 1) {
        cleanse(rootChildren[i]);
    }

    return root.innerHTML;
}

export function enforceLinkBehavior(container, openLinksInNewTab) {
    const links = container.querySelectorAll("a[href]");
    for (let i = 0; i < links.length; i += 1) {
        const link = links[i];
        if (openLinksInNewTab) {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
        } else {
            link.removeAttribute("target");
            link.removeAttribute("rel");
        }
    }
}
