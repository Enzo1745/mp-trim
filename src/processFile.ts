import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { FileItem, ResultItem } from "./types";
import { getOutputExt, getTrimmedName } from "./utils";

interface Silence {
  start: number;
  end: number;
}

async function detectSilences(
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

async function encodeAudio(
  ffmpeg: FFmpeg,
  inputName: string,
  outputName: string,
  stopSeconds: number,
) {
  await ffmpeg.exec([
    "-i",
    inputName,
    "-af",
    `silenceremove=stop_periods=-1:stop_duration=${stopSeconds}:stop_threshold=-50dB`,
    "-c:a",
    "libmp3lame",
    "-q:a",
    "2",
    outputName,
  ]);
}

async function encodeVideo(
  ffmpeg: FFmpeg,
  inputName: string,
  outputName: string,
  silences: Silence[],
) {
  if (silences.length === 0) {
    try {
      await ffmpeg.exec([
        "-i", inputName,
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        outputName,
      ]);
      return;
    } catch {
      /* fall through to re-encode */
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }
    await ffmpeg.exec([
      "-i", inputName,
      "-c:v", "libx264", "-preset", "fast",
      "-c:a", "aac", "-b:a", "192k",
      outputName,
    ]);
    return;
  }

  const expr = silences
    .map((s) => `between(t,${s.start},${s.end})`)
    .join("+");
  const sel = `not(${expr})`;
  await ffmpeg.exec([
    "-i", inputName,
    "-filter_complex",
    `[0:v]select='${sel}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${sel}',asetpts=N/SR/TB[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "fast",
    "-c:a", "aac", "-b:a", "192k",
    outputName,
  ]);
}

export async function processFile(
  ffmpeg: FFmpeg,
  item: FileItem,
  index: number,
  thresholdMs: number,
): Promise<ResultItem> {
  const stopSeconds = thresholdMs / 1000;
  const inputName = `input_${index}.${item.ext}`;
  const outputName = `output_${index}.${getOutputExt(item.kind)}`;
  const base = {
    id: item.id,
    originalName: item.name,
    trimmedName: getTrimmedName(item.name, item.kind),
    kind: item.kind,
  };

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(item.file));
    if (item.kind === "audio") {
      await encodeAudio(ffmpeg, inputName, outputName, stopSeconds);
    } else {
      const silences = await detectSilences(ffmpeg, inputName, stopSeconds);
      await encodeVideo(ffmpeg, inputName, outputName, silences);
    }
    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    const buffer = new Uint8Array(data.length);
    buffer.set(data);
    const mime = item.kind === "audio" ? "audio/mpeg" : "video/mp4";
    return { ...base, blob: new Blob([buffer], { type: mime }) };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Processing failed",
    };
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }
  }
}
