import type { FileKind } from "../types";

export function KindBadge({ kind }: { kind: FileKind }) {
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${
        kind === "audio"
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-purple-500/15 text-purple-400"
      }`}
    >
      {kind === "audio" ? "AUDIO → MP3" : "VIDEO → MP4"}
    </span>
  );
}
