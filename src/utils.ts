import type { FileItem, FileKind } from "./types";

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

export function getTrimmedName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) return `${name}_trimmed`;
  return `${name.slice(0, lastDot)}_trimmed${name.slice(lastDot)}`;
}

export function getMergeOutputKind(files: FileItem[]): FileKind | null {
  if (files.length === 0) return null;
  return files.some((f) => f.kind === "video") ? "video" : "audio";
}

export function getMergeOutputExt(files: FileItem[]): "mp3" | "mp4" | null {
  const kind = getMergeOutputKind(files);
  if (!kind) return null;
  return kind === "audio" ? "mp3" : "mp4";
}

export function mimeFor(ext: string): string {
  switch (ext) {
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "ogg": return "audio/ogg";
    case "flac": return "audio/flac";
    case "aac": return "audio/aac";
    case "m4a": return "audio/mp4";
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "avi": return "video/x-msvideo";
    case "mkv": return "video/x-matroska";
    case "webm": return "video/webm";
    default: return "application/octet-stream";
  }
}
