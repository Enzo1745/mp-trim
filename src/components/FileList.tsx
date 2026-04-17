import { useState } from "react";
import type { DragEvent } from "react";
import type { FileItem } from "../types";
import { formatFileSize } from "../utils";
import { KindBadge } from "./KindBadge";

interface Props {
  files: FileItem[];
  ffmpegReady: boolean;
  ffmpegLoading: boolean;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onStart: () => void;
}

export function FileList({
  files,
  ffmpegReady,
  ffmpegLoading,
  onRemove,
  onReorder,
  onStart,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const handleRowDragStart = (e: DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-mptrim-row", id);
  };
  const handleRowDragOver = (e: DragEvent, id: string) => {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverId !== id) setHoverId(id);
  };
  const handleRowDrop = (e: DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedId && draggedId !== id) onReorder(draggedId, id);
    setDraggedId(null);
    setHoverId(null);
  };
  const handleRowDragEnd = () => {
    setDraggedId(null);
    setHoverId(null);
  };

  return (
    <div className="mt-4 space-y-2">
      {files.map((f) => {
        const isDragging = draggedId === f.id;
        const isHover = hoverId === f.id && draggedId && draggedId !== f.id;
        return (
          <div
            key={f.id}
            draggable
            onDragStart={(e) => handleRowDragStart(e, f.id)}
            onDragOver={(e) => handleRowDragOver(e, f.id)}
            onDrop={(e) => handleRowDrop(e, f.id)}
            onDragEnd={handleRowDragEnd}
            className={`flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3 border transition-all cursor-grab active:cursor-grabbing ${
              isDragging
                ? "opacity-40 border-zinc-800"
                : isHover
                  ? "border-indigo-500"
                  : "border-zinc-800"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="text-zinc-600 text-sm select-none"
                title="Drag to reorder"
              >
                ⋮⋮
              </span>
              <KindBadge kind={f.kind} ext={f.ext} />
              <span className="text-sm text-zinc-200 truncate">{f.name}</span>
              <span className="text-zinc-500 text-xs shrink-0">
                {formatFileSize(f.size)}
              </span>
            </div>
            <button
              onClick={() => onRemove(f.id)}
              className="text-zinc-500 hover:text-red-400 ml-3 shrink-0 text-lg leading-none cursor-pointer"
              title="Remove"
            >
              ×
            </button>
          </div>
        );
      })}

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
