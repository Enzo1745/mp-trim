import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { FileItem, FileKind, ResultItem } from "./types";
import {
  trimAudioIntermediate,
  trimVideoIntermediate,
} from "./mergeIntermediates";

async function concatAudio(
  ffmpeg: FFmpeg,
  intermediates: string[],
  outputName: string,
) {
  const filter =
    intermediates.map((_, i) => `[${i}:a]`).join("") +
    `concat=n=${intermediates.length}:v=0:a=1[a]`;
  const args: string[] = [];
  for (const f of intermediates) args.push("-i", f);
  args.push(
    "-filter_complex", filter,
    "-map", "[a]",
    "-c:a", "libmp3lame", "-q:a", "2",
    outputName,
  );
  await ffmpeg.exec(args);
}

async function concatVideo(
  ffmpeg: FFmpeg,
  intermediates: string[],
  outputName: string,
) {
  const filter =
    intermediates.map((_, i) => `[${i}:v][${i}:a]`).join("") +
    `concat=n=${intermediates.length}:v=1:a=1[v][a]`;
  const args: string[] = [];
  for (const f of intermediates) args.push("-i", f);
  args.push(
    "-filter_complex", filter,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    outputName,
  );
  await ffmpeg.exec(args);
}

export async function mergeFiles(
  ffmpeg: FFmpeg,
  items: FileItem[],
  thresholdMs: number,
  outputKind: FileKind,
  onProgress: (index: number) => void,
): Promise<ResultItem> {
  const stopSeconds = thresholdMs / 1000;
  const intermediates: string[] = [];
  const outputExt = outputKind === "audio" ? "mp3" : "mp4";
  const finalName = `merged_trimmed.${outputExt}`;

  try {
    for (let i = 0; i < items.length; i++) {
      onProgress(i + 1);
      try {
        const mid =
          outputKind === "audio"
            ? await trimAudioIntermediate(ffmpeg, items[i], i, stopSeconds)
            : await trimVideoIntermediate(ffmpeg, items[i], i, stopSeconds);
        intermediates.push(mid);
      } catch {
        throw new Error(
          `Merge failed: ${items[i].name} could not be processed.`,
        );
      }
    }

    if (outputKind === "audio") {
      await concatAudio(ffmpeg, intermediates, finalName);
    } else {
      await concatVideo(ffmpeg, intermediates, finalName);
    }

    const data = (await ffmpeg.readFile(finalName)) as Uint8Array;
    const buffer = new Uint8Array(data.length);
    buffer.set(data);
    const mime = outputKind === "audio" ? "audio/mpeg" : "video/mp4";
    const blob = new Blob([buffer], { type: mime });

    return {
      id: crypto.randomUUID(),
      originalName: `Merged (${items.length} files)`,
      trimmedName: finalName,
      kind: outputKind,
      ext: outputExt,
      blob,
    };
  } finally {
    for (const f of intermediates) {
      try { await ffmpeg.deleteFile(f); } catch { /* ignore */ }
    }
    try { await ffmpeg.deleteFile(finalName); } catch { /* ignore */ }
  }
}
