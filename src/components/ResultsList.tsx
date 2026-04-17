import type { OutputMode, ResultItem } from "../types";
import { KindBadge } from "./KindBadge";

interface Props {
  results: ResultItem[];
  mode: OutputMode;
  onDownload: (r: ResultItem) => void;
  onDownloadAll: () => void;
  onReset: () => void;
}

export function ResultsList({
  results,
  mode,
  onDownload,
  onDownloadAll,
  onReset,
}: Props) {
  const successCount = results.filter((r) => !r.error).length;
  const isMerge = mode === "merge";
  const summary = isMerge
    ? successCount > 0
      ? "Files merged into one"
      : "Merge failed"
    : `${successCount} of ${results.length} file${results.length !== 1 ? "s" : ""} trimmed`;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-zinc-300 font-medium">{summary}</p>
        <div className="flex gap-2">
          {successCount > 0 && !isMerge && (
            <button
              onClick={onDownloadAll}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Download All
            </button>
          )}
          <button
            onClick={onReset}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Start Over
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {results.map((r) => (
          <div
            key={r.id}
            className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
              r.error
                ? "bg-red-500/5 border-red-500/20"
                : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {r.ext && <KindBadge kind={r.kind} ext={r.ext} />}
              <span
                className={`text-sm truncate ${r.error ? "text-red-400" : "text-zinc-200"}`}
              >
                {r.error ? r.originalName : r.trimmedName}
              </span>
              {r.error && (
                <span className="text-xs text-red-400/70 shrink-0">
                  — {r.error}
                </span>
              )}
            </div>
            {r.blob ? (
              <button
                onClick={() => onDownload(r)}
                className="text-indigo-400 hover:text-indigo-300 text-sm font-medium ml-3 shrink-0 cursor-pointer"
              >
                Download
              </button>
            ) : (
              <span className="text-red-400/60 text-sm ml-3 shrink-0">
                Failed
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
