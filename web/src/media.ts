import { toQuery } from "./api";

export function proxiedImageUrl(url: string | null | undefined): string {
  const value = url?.trim();
  if (!value) return "";
  if (value.startsWith("data:image/") || value.startsWith("/")) return value;
  if (value.startsWith("//")) return `/api/image-proxy${toQuery({ url: `https:${value}` })}`;
  return `/api/image-proxy${toQuery({ url: value })}`;
}
