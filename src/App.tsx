import { useCallback, useState } from "react";
import type { AppState, FileItem, OutputMode, ResultItem } from "./types";
import {
  SILENCE_DEFAULT_MS,
  getExt,
  getFileKind,
  getMergeOutputExt,
  getMergeOutputKind,
} from "./utils";
import { useFFmpeg } from "./useFFmpeg";
import { processFile } from "./processFile";
import { mergeFiles } from "./mergeFiles";
import { SilenceSlider } from "./components/SilenceSlider";
import { OutputModeToggle } from "./components/OutputModeToggle";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";
import { ProcessingView } from "./components/ProcessingView";
import { ResultsList } from "./components/ResultsList";

export default function App() {
  const [appState, setAppState] = useState<AppState>("empty");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [silenceMs, setSilenceMs] = useState(SILENCE_DEFAULT_MS);
  const [outputMode, setOutputMode] = useState<OutputMode>("separate");
  const [runMode, setRunMode] = useState<OutputMode>("separate");

  const { ffmpegRef, ready: ffmpegReady, loading: ffmpegLoading } = useFFmpeg();

  const addFiles = useCallback((incoming: File[]) => {
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
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length === 0) setAppState("empty");
      return next;
    });
  }, []);

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

  const start = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !ffmpegReady) return;
    const threshold = silenceMs;
    const mode = outputMode;
    setRunMode(mode);
    setAppState("processing");
    setProcessingIndex(0);

    if (mode === "merge") {
      const outputKind = getMergeOutputKind(files);
      if (!outputKind) {
        setAppState("ready");
        return;
      }
      const outputExt = outputKind === "audio" ? "mp3" : "mp4";
      try {
        const result = await mergeFiles(
          ffmpeg,
          files,
          threshold,
          outputKind,
          setProcessingIndex,
        );
        setResults([result]);
      } catch (error) {
        setResults([
          {
            id: crypto.randomUUID(),
            originalName: `Merged (${files.length} files)`,
            trimmedName: `merged_trimmed.${outputExt}`,
            kind: outputKind,
            ext: outputExt,
            error: error instanceof Error ? error.message : "Merge failed",
          },
        ]);
      }
    } else {
      const newResults: ResultItem[] = [];
      for (let i = 0; i < files.length; i++) {
        setProcessingIndex(i + 1);
        newResults.push(await processFile(ffmpeg, files[i], i, threshold));
      }
      setResults(newResults);
    }

    setAppState("done");
  };

  const downloadResult = (r: ResultItem) => {
    if (!r.blob) return;
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.trimmedName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = async () => {
    for (const r of results) {
      if (r.blob) {
        downloadResult(r);
        await new Promise((res) => setTimeout(res, 300));
      }
    }
  };

  const reset = () => {
    setFiles([]);
    setResults([]);
    setProcessingIndex(0);
    setAppState("empty");
  };

  const showControls = appState === "empty" || appState === "ready";
  const mergeOutputExt = getMergeOutputExt(files);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight">mp-trim</h1>
          <p className="text-zinc-400 mt-2">
            Remove silences from audio &amp; video — entirely in your browser
          </p>
          {ffmpegLoading && (
            <p className="text-zinc-500 text-sm mt-3">Loading FFmpeg…</p>
          )}
        </header>

        {showControls && (
          <>
            <SilenceSlider value={silenceMs} onChange={setSilenceMs} />
            <OutputModeToggle
              mode={outputMode}
              onChange={setOutputMode}
              mergeOutputExt={mergeOutputExt}
            />
            <DropZone compact={appState === "ready"} onFiles={addFiles} />
          </>
        )}

        {appState === "ready" && files.length > 0 && (
          <FileList
            files={files}
            ffmpegReady={ffmpegReady}
            ffmpegLoading={ffmpegLoading}
            onRemove={removeFile}
            onReorder={reorderFiles}
            onStart={start}
          />
        )}

        {appState === "processing" && (
          <ProcessingView files={files} currentIndex={processingIndex} />
        )}

        {appState === "done" && (
          <ResultsList
            results={results}
            mode={runMode}
            onDownload={downloadResult}
            onDownloadAll={downloadAll}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}
