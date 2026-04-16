import { useState, useRef, useCallback, useEffect } from "react";
import type { DragEvent, ChangeEvent } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type AppState = "empty" | "ready" | "processing" | "done";
type FileType = "mp3" | "mp4";

interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: FileType;
}

interface ResultItem {
  id: string;
  originalName: string;
  trimmedName: string;
  type: FileType;
  blob?: Blob;
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(name: string): FileType | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "mp3") return "mp3";
  if (ext === "mp4") return "mp4";
  return null;
}

function getTrimmedName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) return `${name}_trimmed`;
  return `${name.slice(0, lastDot)}_trimmed${name.slice(lastDot)}`;
}

const SILENCE_FILTER =
  "silenceremove=stop_periods=-1:stop_duration=0.2:stop_threshold=-50dB";

export default function App() {
  const [appState, setAppState] = useState<AppState>("empty");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setFfmpegLoading(true);
      try {
        const ffmpeg = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript",
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm",
          ),
        });
        if (!cancelled) {
          ffmpegRef.current = ffmpeg;
          setFfmpegReady(true);
        }
      } catch (e) {
        console.error("Failed to load FFmpeg:", e);
      } finally {
        if (!cancelled) setFfmpegLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    const valid: FileItem[] = [];
    for (const file of incoming) {
      const type = getFileType(file.name);
      if (type) {
        valid.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          size: file.size,
          type,
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
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files));
        e.target.value = "";
      }
    },
    [addFiles],
  );

  const processFiles = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !ffmpegReady) return;

    setAppState("processing");
    setProcessingIndex(0);
    const newResults: ResultItem[] = [];

    for (let i = 0; i < files.length; i++) {
      setProcessingIndex(i + 1);
      const item = files[i];
      const inputName = `input_${i}.${item.type}`;
      const outputName = `output_${i}.${item.type}`;

      try {
        await ffmpeg.writeFile(inputName, await fetchFile(item.file));

        if (item.type === "mp3") {
          await ffmpeg.exec(["-i", inputName, "-af", SILENCE_FILTER, outputName]);
        } else {
          // Pass 1: detect where silences are
          const silenceLog: string[] = [];
          const onLog = ({ message }: { message: string }) => {
            if (
              message.includes("silence_start") ||
              message.includes("silence_end")
            ) {
              silenceLog.push(message);
            }
          };
          ffmpeg.on("log", onLog);
          await ffmpeg.exec([
            "-i",
            inputName,
            "-af",
            "silencedetect=noise=-50dB:d=0.2",
            "-f",
            "null",
            "-",
          ]);
          ffmpeg.off("log", onLog);

          // Parse silence periods from log
          const silences: { start: number; end: number }[] = [];
          let pendingStart: number | null = null;
          for (const line of silenceLog) {
            const sm = line.match(/silence_start:\s*([\d.eE+-]+)/);
            const em = line.match(/silence_end:\s*([\d.eE+-]+)/);
            if (sm) pendingStart = parseFloat(sm[1]);
            if (em && pendingStart !== null) {
              silences.push({
                start: pendingStart,
                end: parseFloat(em[1]),
              });
              pendingStart = null;
            }
          }
          // Trailing silence (no silence_end before EOF)
          if (pendingStart !== null) {
            silences.push({ start: pendingStart, end: 99999 });
          }

          if (silences.length === 0) {
            await ffmpeg.exec(["-i", inputName, "-c", "copy", outputName]);
          } else {
            // Pass 2: drop silent sections from both video and audio
            const expr = silences
              .map((s) => `between(t,${s.start},${s.end})`)
              .join("+");
            const sel = `not(${expr})`;
            await ffmpeg.exec([
              "-i",
              inputName,
              "-filter_complex",
              `[0:v]select='${sel}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${sel}',asetpts=N/SR/TB[a]`,
              "-map",
              "[v]",
              "-map",
              "[a]",
              outputName,
            ]);
          }
        }

        const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
        const buffer = new Uint8Array(data.length);
        buffer.set(data);
        const mime = item.type === "mp3" ? "audio/mpeg" : "video/mp4";
        const blob = new Blob([buffer], { type: mime });

        newResults.push({
          id: item.id,
          originalName: item.name,
          trimmedName: getTrimmedName(item.name),
          type: item.type,
          blob,
        });
      } catch (error) {
        newResults.push({
          id: item.id,
          originalName: item.name,
          trimmedName: getTrimmedName(item.name),
          type: item.type,
          error: error instanceof Error ? error.message : "Processing failed",
        });
      }

      try {
        await ffmpeg.deleteFile(inputName);
      } catch {
        /* already cleaned */
      }
      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        /* already cleaned */
      }
    }

    setResults(newResults);
    setAppState("done");
  };

  const downloadFile = (r: ResultItem) => {
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
        downloadFile(r);
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

  const successCount = results.filter((r) => !r.error).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight">mp-trim</h1>
          <p className="text-zinc-400 mt-2">
            Remove silences from MP3 &amp; MP4 files — entirely in your browser
          </p>
          {ffmpegLoading && (
            <p className="text-zinc-500 text-sm mt-3">Loading FFmpeg…</p>
          )}
        </header>

        {/* ── Drop zone (empty + ready) ── */}
        {(appState === "empty" || appState === "ready") && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl text-center cursor-pointer transition-all
              ${isDragOver ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"}
              ${appState === "ready" ? "py-4 px-6" : "py-16 px-8"}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.mp4"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            {appState === "empty" ? (
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
                  Drop MP3 or MP4 files here
                </p>
                <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
              </>
            ) : (
              <p className="text-zinc-500 text-sm">
                Drop more files or click to browse
              </p>
            )}
          </div>
        )}

        {/* ── File list (ready) ── */}
        {appState === "ready" && files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-800"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      f.type === "mp3"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-purple-500/15 text-purple-400"
                    }`}
                  >
                    {f.type.toUpperCase()}
                  </span>
                  <span className="text-sm text-zinc-200 truncate">
                    {f.name}
                  </span>
                  <span className="text-zinc-500 text-xs shrink-0">
                    {formatFileSize(f.size)}
                  </span>
                </div>
                <button
                  onClick={() => removeFile(f.id)}
                  className="text-zinc-500 hover:text-red-400 ml-3 shrink-0 text-lg leading-none"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              onClick={processFiles}
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
        )}

        {/* ── Processing ── */}
        {appState === "processing" && (
          <div className="mt-2">
            <div className="flex items-center justify-center gap-3 bg-zinc-900 rounded-lg px-6 py-4 border border-zinc-800">
              <svg
                className="animate-spin h-5 w-5 text-indigo-400"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-zinc-300 font-medium">
                Processing {processingIndex} / {files.length}…
              </span>
            </div>

            <div className="mt-4 space-y-1">
              {files.map((f, i) => {
                const done = i + 1 < processingIndex;
                const active = i + 1 === processingIndex;
                return (
                  <div
                    key={f.id}
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm ${
                      done
                        ? "text-emerald-400"
                        : active
                          ? "text-indigo-400 font-medium"
                          : "text-zinc-600"
                    }`}
                  >
                    <span className="w-4 text-center">
                      {done ? "✓" : active ? "›" : "·"}
                    </span>
                    <span className="truncate">{f.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {appState === "done" && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-4">
              <p className="text-zinc-300 font-medium">
                {successCount} of {results.length} file
                {results.length !== 1 ? "s" : ""} trimmed
              </p>
              <div className="flex gap-2">
                {successCount > 0 && (
                  <button
                    onClick={downloadAll}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    Download All
                  </button>
                )}
                <button
                  onClick={reset}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Start Over
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {results.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                    r.error
                      ? "bg-red-500/5 border-red-500/20"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        r.type === "mp3"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-purple-500/15 text-purple-400"
                      }`}
                    >
                      {r.type.toUpperCase()}
                    </span>
                    <span
                      className={`text-sm truncate ${r.error ? "text-red-400" : "text-zinc-200"}`}
                    >
                      {r.originalName}
                    </span>
                    {r.error && (
                      <span className="text-xs text-red-400/70 shrink-0">
                        — {r.error}
                      </span>
                    )}
                  </div>
                  {r.blob ? (
                    <button
                      onClick={() => downloadFile(r)}
                      className="text-indigo-400 hover:text-indigo-300 text-sm font-medium ml-3 shrink-0 cursor-pointer"
                    >
                      Download
                    </button>
                  ) : (
                    <span className="text-red-400/60 text-sm ml-3 shrink-0">
                      Failed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
