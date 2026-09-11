export type SizeChartSpec = {
  columns: string[];
  rows: string[][];
  note: string;
};

export type ShopifySizeChart = {
  imageUrl: string;
  hash: string;
  spec: SizeChartSpec;
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, maxLength) : "";
}

function stableHash(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeSizeChartSpec(value: unknown): SizeChartSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as { columns?: unknown; rows?: unknown; note?: unknown };
  const columns = Array.isArray(source.columns)
    ? source.columns.map((item) => text(item, 32)).filter(Boolean).slice(0, 12)
    : [];
  const rows = Array.isArray(source.rows)
    ? source.rows.flatMap((row) => Array.isArray(row) ? [row.map((item) => text(item, 80)).slice(0, columns.length)] : []).filter((row) => row.some(Boolean)).slice(0, 24)
    : [];
  if (!columns.length || !rows.length || !columns.some((column) => /^(?:size|尺码|尺碼|尺寸)$/iu.test(column))) return null;
  return {
    columns,
    rows: rows.map((row) => [...row, ...Array(Math.max(0, columns.length - row.length)).fill("")]),
    note: text(source.note, 240),
  };
}

export function sizeChartHash(spec: SizeChartSpec): string {
  return stableHash(spec);
}

export function buildSizeChartImagePrompt(input: { title: string; spec: SizeChartSpec; targetLanguage: string }): string {
  return [
    "Use case: productivity-visual",
    "Asset type: Shopify product image, square size chart.",
    "Primary request: Create a clean premium ecommerce size-chart infographic. This must be a data table, not a fashion photograph.",
    "Style/medium: minimal premium ecommerce infographic with a warm white background, charcoal text, and one muted navy accent color; highly legible modern sans-serif typography, thin light-gray grid lines, no green palette, no decorative objects, no gradients.",
    "Composition/framing: square 1024x1024 canvas; clear product title at top, compact table centered with generous whitespace, navy header row with white text, bold size column, subtle alternating row tint, measurement note at bottom, balanced margins.",
    `Text language: ${input.targetLanguage}.`,
    `Product title: ${input.title}.`,
    "Text (verbatim): Render every column header, every cell value, and the note below exactly as supplied. Do not translate, paraphrase, omit, add, reorder, round, or alter any letter, digit, symbol, unit, or punctuation.",
    `TABLE DATA (verbatim JSON): ${JSON.stringify(input.spec)}`,
    "Constraints: show only this table and this supplied text. No model, garment, body diagram, logo, price, URL, watermark, or extra claims.",
  ].join("\n");
}
