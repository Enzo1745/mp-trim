import { useCallback, useState } from "react";
import type { AppState, FileItem } from "../types";
import { getExt, getFileKind } from "../utils";

export function useFiles(setAppState: (s: AppState) => void) {
  const [files, setFiles] = useState<FileItem[]>([]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const valid: FileItem[] = [];
      for (const file of incoming) {
        const kind = getFileKind(file.name);
        if (kind) {
          valid.push({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            size: file.size,
            kind,
            ext: getExt(file.name),
          });
        }
      }
      if (valid.length === 0) return;
      setFiles((prev) => [...prev, ...valid]);
      setAppState("ready");
    },
    [setAppState],
  );

  const removeFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== id);
        if (next.length === 0) setAppState("empty");
        return next;
      });
    },
    [setAppState],
  );

  const reorderFiles = useCallback((fromId: string, toId: string) => {
    setFiles((prev) => {
      const fromIdx = prev.findIndex((f) => f.id === fromId);
      const toIdx = prev.findIndex((f) => f.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  return { files, setFiles, addFiles, removeFile, reorderFiles };
}
