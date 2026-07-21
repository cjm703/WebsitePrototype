const BLOCKED_ELEMENTS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "link",
  "meta",
  "base",
  "svg",
  "math",
];

function isSafeResourceUrl(value: string, allowImageData: boolean) {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  if (!normalized || normalized.startsWith("#") || normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) {
    return true;
  }
  if (/^(https?:|mailto:|tel:|blob:)/.test(normalized)) return true;
  return allowImageData && /^data:image\/(png|gif|jpe?g|webp|avif);base64,/.test(normalized);
}

export function sanitizeRichHtml(html: string) {
  if (!html || typeof DOMParser === "undefined") return html || "";

  const documentNode = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = documentNode.body.firstElementChild;
  if (!root) return "";

  root.querySelectorAll(BLOCKED_ELEMENTS.join(",")).forEach((element) => element.remove());
  root.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === "href" || name === "src" || name === "xlink:href") && !isSafeResourceUrl(value, name === "src")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style" && /(expression\s*\(|url\s*\(\s*['\"]?\s*(javascript|vbscript|data:text\/html))/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  return root.innerHTML;
}
