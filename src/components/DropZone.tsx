import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { ACCEPT_ATTR } from "../utils";

interface Props {
  compact: boolean;
  onFiles: (files: File[]) => void;
}

export function DropZone({ compact, onFiles }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
    [onFiles],
  );
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        onFiles(Array.from(e.target.files));
        e.target.value = "";
      }
    },
    [onFiles],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-xl text-center cursor-pointer transition-all
        ${isDragOver ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"}
        ${compact ? "py-4 px-6" : "py-16 px-8"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        onChange={handleChange}
        className="hidden"
      />
      {compact ? (
        <p className="text-zinc-500 text-sm">
          Drop more files or click to browse
        </p>
      ) : (
        <>
          <svg
            className="mx-auto h-10 w-10 text-zinc-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-zinc-300 font-medium">
            Drop audio or video files here
          </p>
          <p className="text-zinc-500 text-sm mt-1">
            mp3, m4a, aac, wav, ogg, flac, mp4, mov, avi, mkv, webm
          </p>
          <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
        </>
      )}
    </div>
  );
}
