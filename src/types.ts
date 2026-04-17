export type AppState = "empty" | "ready" | "processing" | "done";
export type FileKind = "audio" | "video";

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  kind: FileKind;
  ext: string;
}

export interface ResultItem {
  id: string;
  originalName: string;
  trimmedName: string;
  kind: FileKind;
  blob?: Blob;
  error?: string;
}
