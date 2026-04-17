import type { FileItem } from "../types";
import { formatFileSize } from "../utils";
import { KindBadge } from "./KindBadge";

interface Props {
  files: FileItem[];
  ffmpegReady: boolean;
  ffmpegLoading: boolean;
  onRemove: (id: string) => void;
  onStart: () => void;
}

export function FileList({
  files,
  ffmpegReady,
  ffmpegLoading,
  onRemove,
  onStart,
}: Props) {
  return (
    <div className="mt-4 space-y-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-800"
        >
          <div className="flex items-center gap-3 min-w-0">
            <KindBadge kind={f.kind} />
            <span className="text-sm text-zinc-200 truncate">{f.name}</span>
            <span className="text-zinc-500 text-xs shrink-0">
              {formatFileSize(f.size)}
            </span>
          </div>
          <button
            onClick={() => onRemove(f.id)}
            className="text-zinc-500 hover:text-red-400 ml-3 shrink-0 text-lg leading-none"
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}

      <button
        onClick={onStart}
        disabled={!ffmpegReady}
        className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors cursor-pointer"
      >
        {ffmpegLoading
          ? "Loading FFmpeg…"
          : !ffmpegReady
            ? "FFmpeg unavailable"
            : "Trim Silences"}
      </button>
    </div>
  );
}
