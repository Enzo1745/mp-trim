import { useCallback, useState } from "react";
import type { AppState, FileItem, ResultItem } from "./types";
import { SILENCE_DEFAULT_MS, getExt, getFileKind } from "./utils";
import { useFFmpeg } from "./useFFmpeg";
import { processFile } from "./processFile";
import { SilenceSlider } from "./components/SilenceSlider";
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

  const start = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !ffmpegReady) return;
    const threshold = silenceMs;
    setAppState("processing");
    setProcessingIndex(0);
    const newResults: ResultItem[] = [];
    for (let i = 0; i < files.length; i++) {
      setProcessingIndex(i + 1);
      newResults.push(await processFile(ffmpeg, files[i], i, threshold));
    }
    setResults(newResults);
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

  const showDropZone = appState === "empty" || appState === "ready";

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

        {showDropZone && (
          <>
            <SilenceSlider value={silenceMs} onChange={setSilenceMs} />
            <DropZone compact={appState === "ready"} onFiles={addFiles} />
          </>
        )}

        {appState === "ready" && files.length > 0 && (
          <FileList
            files={files}
            ffmpegReady={ffmpegReady}
            ffmpegLoading={ffmpegLoading}
            onRemove={removeFile}
            onStart={start}
          />
        )}

        {appState === "processing" && (
          <ProcessingView files={files} currentIndex={processingIndex} />
        )}

        {appState === "done" && (
          <ResultsList
            results={results}
            onDownload={downloadResult}
            onDownloadAll={downloadAll}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}
