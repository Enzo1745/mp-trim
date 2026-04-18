import type { ResultItem } from "./types";

export function downloadResult(r: ResultItem) {
  if (!r.blob) return;
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = r.trimmedName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAllResults(results: ResultItem[]) {
  for (const r of results) {
    if (r.blob) {
      downloadResult(r);
      await new Promise((res) => setTimeout(res, 300));
    }
  }
}
