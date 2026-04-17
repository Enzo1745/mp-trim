import type { FileKind } from "../types";

interface Props {
  kind: FileKind;
  ext: string;
}

export function KindBadge({ kind, ext }: Props) {
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${
        kind === "audio"
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-purple-500/15 text-purple-400"
      }`}
    >
      {ext.toUpperCase()}
    </span>
  );
}
