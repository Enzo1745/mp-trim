import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { FileItem, ResultItem } from "./types";
import { getTrimmedName, mimeFor } from "./utils";

export interface Silence {
  start: number;
  end: number;
}

export async function detectSilences(
  ffmpeg: FFmpeg,
  inputName: string,
  stopSeconds: number,
): Promise<Silence[]> {
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
    `silencedetect=noise=-50dB:d=${stopSeconds}`,
    "-f",
    "null",
    "-",
  ]);
  ffmpeg.off("log", onLog);

  const silences: Silence[] = [];
  let pendingStart: number | null = null;
  for (const line of silenceLog) {
    const sm = line.match(/silence_start:\s*([\d.eE+-]+)/);
    const em = line.match(/silence_end:\s*([\d.eE+-]+)/);
    if (sm) pendingStart = parseFloat(sm[1]);
    if (em && pendingStart !== null) {
      silences.push({ start: pendingStart, end: parseFloat(em[1]) });
      pendingStart = null;
    }
  }
  if (pendingStart !== null) {
    silences.push({ start: pendingStart, end: 99999 });
  }
  return silences;
}

function audioCodecArgs(ext: string): string[] {
  switch (ext) {
    case "mp3": return ["-c:a", "libmp3lame", "-q:a", "2"];
    case "wav": return ["-c:a", "pcm_s16le"];
    case "ogg": return ["-c:a", "libvorbis", "-q:a", "6"];
    case "flac": return ["-c:a", "flac"];
    case "aac":
    case "m4a": return ["-c:a", "aac", "-b:a", "192k"];
    default: return ["-c:a", "aac", "-b:a", "192k"];
  }
}

function videoReEncodeArgs(ext: string): string[] {
  if (ext === "webm") {
    return ["-c:v", "libvpx-vp9", "-b:v", "1M", "-c:a", "libopus", "-b:a", "128k"];
  }
  if (ext === "avi") {
    return ["-c:v", "libx264", "-preset", "fast", "-c:a", "libmp3lame", "-q:a", "2"];
  }
  return ["-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "192k"];
}

export async function processFile(
  ffmpeg: FFmpeg,
  item: FileItem,
  index: number,
  thresholdMs: number,
): Promise<ResultItem> {
  const stopSeconds = thresholdMs / 1000;
  const inputName = `input_${index}.${item.ext}`;
  const outputName = `output_${index}.${item.ext}`;
  const base = {
    id: item.id,
    originalName: item.name,
    trimmedName: getTrimmedName(item.name),
    kind: item.kind,
    ext: item.ext,
  };

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(item.file));

    if (item.kind === "audio") {
      await ffmpeg.exec([
        "-i", inputName,
        "-af", `silenceremove=stop_periods=-1:stop_duration=${stopSeconds}:stop_threshold=-50dB`,
        ...audioCodecArgs(item.ext),
        outputName,
      ]);
    } else {
      const silences = await detectSilences(ffmpeg, inputName, stopSeconds);
      if (silences.length === 0) {
        await ffmpeg.exec(["-i", inputName, "-c", "copy", outputName]);
      } else {
        const expr = silences
          .map((s) => `between(t,${s.start},${s.end})`)
          .join("+");
        const sel = `not(${expr})`;
        await ffmpeg.exec([
          "-i", inputName,
          "-filter_complex",
          `[0:v]select='${sel}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${sel}',asetpts=N/SR/TB[a]`,
          "-map", "[v]", "-map", "[a]",
          ...videoReEncodeArgs(item.ext),
          outputName,
        ]);
      }
    }

    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    const buffer = new Uint8Array(data.length);
    buffer.set(data);
    return { ...base, blob: new Blob([buffer], { type: mimeFor(item.ext) }) };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Processing failed",
    };
  } finally {
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
  }
}
