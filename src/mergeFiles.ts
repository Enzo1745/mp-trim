import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { FileItem, FileKind, ResultItem } from "./types";
import {
  trimAudioIntermediate,
  trimVideoIntermediate,
} from "./mergeIntermediates";

const CONCAT_LIST = "concat_list.txt";

async function concatCopy(
  ffmpeg: FFmpeg,
  intermediates: string[],
  outputName: string,
) {
  const listBody = intermediates.map((f) => `file '${f}'`).join("\n") + "\n";
  await ffmpeg.writeFile(CONCAT_LIST, new TextEncoder().encode(listBody));
  try {
    await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", CONCAT_LIST,
      "-c", "copy",
      outputName,
    ]);
  } finally {
    try { await ffmpeg.deleteFile(CONCAT_LIST); } catch { /* ignore */ }
  }
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

    await concatCopy(ffmpeg, intermediates, finalName);

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
