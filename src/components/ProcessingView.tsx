import type { FileItem } from "../types";

interface Props {
  files: FileItem[];
  currentIndex: number;
}

export function ProcessingView({ files, currentIndex }: Props) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-center gap-3 bg-zinc-900 rounded-lg px-6 py-4 border border-zinc-800">
        <svg
          className="animate-spin h-5 w-5 text-indigo-400"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-zinc-300 font-medium">
          Processing {currentIndex} / {files.length}…
        </span>
      </div>

      <div className="mt-4 space-y-1">
        {files.map((f, i) => {
          const done = i + 1 < currentIndex;
          const active = i + 1 === currentIndex;
          return (
            <div
              key={f.id}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm ${
                done
                  ? "text-emerald-400"
                  : active
                    ? "text-indigo-400 font-medium"
                    : "text-zinc-600"
              }`}
            >
              <span className="w-4 text-center">
                {done ? "✓" : active ? "›" : "·"}
              </span>
              <span className="truncate">{f.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
