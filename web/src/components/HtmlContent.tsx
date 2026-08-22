import DOMPurify from "dompurify";
import parse, { domToReact } from "html-react-parser";
import type { HTMLReactParserOptions } from "html-react-parser";
import { useMemo } from "react";

import { proxiedImageUrl } from "../media";

type Props = {
  html?: string | null;
  images?: string[];
  className?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function valueToHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value);
    return /<\/?[a-z][^>]*>/iu.test(text) ? text : `<p>${escapeHtml(text).replace(/\r?\n/gu, "<br />")}</p>`;
  }
  if (Array.isArray(value)) return value.map(valueToHtml).join("");
  const record = asRecord(value);
  if (!record) return "";
  if (typeof record.html === "string") return record.html;
  const image = [record.url, record.src, record.image, record.imageUrl, record.picUrl, record.content]
    .find((item) => typeof item === "string" && /^(?:https?:)?\/\//iu.test(item));
  if (image) return `<img src="${escapeHtml(String(image))}" alt="商品详情图片" />`;
  const children = record.items ?? record.children ?? record.content ?? record.value ?? record.data;
  if (children !== undefined) return valueToHtml(children);
  const text = record.text ?? record.title ?? record.name;
  return text === undefined ? "" : valueToHtml(text);
}

function decodeDescription(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const candidates = [
    text,
    text.replace(/\\r\\n/gu, "\n").replace(/\\n/gu, "\n").replace(/\\"/gu, '"'),
    text.replace(/^\uFEFF/u, ""),
  ];
  for (const candidate of candidates) {
    if (!/^[\[{]/u.test(candidate)) continue;
    try {
      let parsed: unknown = JSON.parse(candidate);
      for (let index = 0; index < 2 && typeof parsed === "string"; index += 1) parsed = JSON.parse(parsed);
      const decoded = valueToHtml(parsed);
      if (decoded) return decoded;
    } catch {
      // Try the next common upstream encoding.
    }
  }
  return text;
}

function imageSource(attributes: Record<string, string>): string {
  return attributes.src || attributes["data-src"] || attributes["data-lazyload-src"] || attributes["data-original"] || attributes["lazy-src"] || "";
}

export function HtmlContent({ html, images = [], className = "" }: Props) {
  const content = useMemo(() => {
    const source = decodeDescription(html ?? "");
    const imageFallback = images.filter(Boolean).map((url) => `<img src="${escapeHtml(url)}" alt="商品详情图片" />`).join("");
    const raw = source || imageFallback;
    if (!raw) return null;
    const sanitized = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["data-src", "data-lazyload-src", "data-original", "lazy-src"],
    });
    const options: HTMLReactParserOptions = {
      replace(node) {
        if (node.type !== "tag") return undefined;
        if (node.name === "img") {
          const url = proxiedImageUrl(imageSource(node.attribs ?? {}));
          return url ? <img src={url} alt={node.attribs?.alt || "商品详情图片"} loading="lazy" /> : null;
        }
        if (node.name === "a") {
          return <a href={node.attribs?.href} target="_blank" rel="noreferrer">{domToReact(node.children as Parameters<typeof domToReact>[0], options)}</a>;
        }
        return undefined;
      },
    };
    return parse(sanitized, options);
  }, [html, images]);

  if (!content) return null;
  return <div className={className}>{content}</div>;
}
