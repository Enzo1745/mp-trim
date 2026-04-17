import type { OutputMode } from "../types";

interface Props {
  mode: OutputMode;
  onChange: (mode: OutputMode) => void;
  mergeOutputExt: "mp3" | "mp4" | null;
}

export function OutputModeToggle({ mode, onChange, mergeOutputExt }: Props) {
  const baseBtn =
    "flex-1 px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer";
  const active = "bg-indigo-600 text-white";
  const inactive = "text-zinc-400 hover:text-zinc-200";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-200">Output mode</span>
      </div>
      <div className="flex gap-1 bg-zinc-950 rounded-lg p-1 border border-zinc-800">
        <button
          type="button"
          onClick={() => onChange("separate")}
          className={`${baseBtn} ${mode === "separate" ? active : inactive}`}
        >
          Separate files
        </button>
        <button
          type="button"
          onClick={() => onChange("merge")}
          className={`${baseBtn} ${mode === "merge" ? active : inactive}`}
        >
          Merge into one
        </button>
      </div>
      {mode === "merge" && mergeOutputExt && (
        <p className="text-xs text-zinc-400 mt-3">
          Output:{" "}
          <span className="font-mono text-zinc-200">
            {mergeOutputExt.toUpperCase()}
          </span>
        </p>
      )}
      {mode === "merge" && !mergeOutputExt && (
        <p className="text-xs text-zinc-500 mt-3">
          Output format will be shown once files are added.
        </p>
      )}
    </div>
  );
}
