import { describe, expect, it } from "vitest";

import { buildSizeChartImagePrompt, normalizeSizeChartSpec, sizeChartHash } from "./size-chart";

describe("AI size chart data", () => {
  it("normalizes valid AI table output", () => {
    const result = normalizeSizeChartSpec({ columns: ["Size", "Bust", "Waist"], rows: [["S", "86 cm", "68 cm"], ["M", "90 cm", "72 cm"]], note: "Manual measurement may vary slightly." });
    expect(result).toEqual({ columns: ["Size", "Bust", "Waist"], rows: [["S", "86 cm", "68 cm"], ["M", "90 cm", "72 cm"]], note: "Manual measurement may vary slightly." });
    expect(sizeChartHash(result!)).toMatch(/^[0-9a-f]{8}$/u);
  });

  it("rejects table data without a size column", () => {
    expect(normalizeSizeChartSpec({ columns: ["Bust"], rows: [["86 cm"]] })).toBeNull();
  });

  it("rejects size labels without corresponding measurement data", () => {
    expect(normalizeSizeChartSpec({ columns: ["Size"], rows: [["S"], ["M"], ["L"]] })).toBeNull();
    expect(normalizeSizeChartSpec({ columns: ["Size", "Bust"], rows: [["S", ""], ["M", ""]] })).toBeNull();
  });

  it("pins table content into the image-generation prompt", () => {
    const spec = { columns: ["Size"], rows: [["M"]], note: "" };
    const prompt = buildSizeChartImagePrompt({ title: "Dress", spec, targetLanguage: "English" });
    expect(prompt).toContain(JSON.stringify(spec));
    expect(prompt).toContain("Do not translate, paraphrase, omit, add, reorder, round, or alter");
    expect(prompt).toContain("warm white background");
    expect(prompt).toContain("no green palette");
  });
});
