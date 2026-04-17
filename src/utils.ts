import type { FileKind } from "./types";

export const AUDIO_EXTS = ["mp3", "m4a", "aac", "wav", "ogg", "flac"] as const;
export const VIDEO_EXTS = ["mp4", "mov", "avi", "mkv", "webm"] as const;
export const ACCEPT_ATTR = [...AUDIO_EXTS, ...VIDEO_EXTS]
  .map((e) => `.${e}`)
  .join(",");

export const SILENCE_MIN_MS = 50;
export const SILENCE_MAX_MS = 2000;
export const SILENCE_STEP_MS = 50;
export const SILENCE_DEFAULT_MS = 400;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function getFileKind(name: string): FileKind | null {
  const ext = getExt(name);
  if ((AUDIO_EXTS as readonly string[]).includes(ext)) return "audio";
  if ((VIDEO_EXTS as readonly string[]).includes(ext)) return "video";
  return null;
}

export function getOutputExt(kind: FileKind): "mp3" | "mp4" {
  return kind === "audio" ? "mp3" : "mp4";
}

export function getTrimmedName(name: string, kind: FileKind): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot === -1 ? name : name.slice(0, lastDot);
  return `${base}_trimmed.${getOutputExt(kind)}`;
}
