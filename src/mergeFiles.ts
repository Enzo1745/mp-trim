import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { FileItem, FileKind, ResultItem } from "./types";
import { detectSilences } from "./processFile";

const VIDEO_W = 1280;
const VIDEO_H = 720;
const VIDEO_FPS = 25;
const SAMPLE_RATE = 44100;

const VIDEO_CHAIN =
  `scale=${VIDEO_W}:${VIDEO_H}:force_original_aspect_ratio=decrease,` +
  `pad=${VIDEO_W}:${VIDEO_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${VIDEO_FPS}`;
const AUDIO_CHAIN =
  `aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;

async function trimAudioIntermediate(
  ffmpeg: FFmpeg,
  item: FileItem,
  index: number,
  stopSeconds: number,
): Promise<string> {
  const inputName = `m_in_${index}.${item.ext}`;
  const outputName = `m_mid_${index}.mp3`;
  await ffmpeg.writeFile(inputName, await fetchFile(item.file));
  try {
    await ffmpeg.exec([
      "-i", inputName,
      "-af",
      `silenceremove=stop_periods=-1:stop_duration=${stopSeconds}:stop_threshold=-50dB,aresample=${SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=stereo`,
      "-c:a", "libmp3lame", "-q:a", "2",
      outputName,
    ]);
  } finally {
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
  }
  return outputName;
}

async function trimVideoIntermediate(
  ffmpeg: FFmpeg,
  item: FileItem,
  index: number,
  stopSeconds: number,
): Promise<string> {
  const inputName = `m_in_${index}.${item.ext}`;
  const outputName = `m_mid_${index}.mp4`;
  await ffmpeg.writeFile(inputName, await fetchFile(item.file));
  try {
    if (item.kind === "audio") {
      // Trim audio, then overlay onto a black video of matching duration.
      const trimmed = `m_aud_${index}.wav`;
      await ffmpeg.exec([
        "-i", inputName,
        "-af",
        `silenceremove=stop_periods=-1:stop_duration=${stopSeconds}:stop_threshold=-50dB,aresample=${SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=stereo`,
        "-c:a", "pcm_s16le",
        trimmed,
      ]);
      try {
        await ffmpeg.exec([
          "-f", "lavfi", "-i",
          `color=c=black:s=${VIDEO_W}x${VIDEO_H}:r=${VIDEO_FPS}`,
          "-i", trimmed,
          "-shortest",
          "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "192k",
          "-ar", `${SAMPLE_RATE}`, "-ac", "2",
          outputName,
        ]);
      } finally {
        try { await ffmpeg.deleteFile(trimmed); } catch { /* ignore */ }
      }
    } else {
      const silences = await detectSilences(ffmpeg, inputName, stopSeconds);
      if (silences.length === 0) {
        await ffmpeg.exec([
          "-i", inputName,
          "-vf", VIDEO_CHAIN,
          "-af", AUDIO_CHAIN,
          "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "192k",
          outputName,
        ]);
      } else {
        const expr = silences
          .map((s) => `between(t,${s.start},${s.end})`)
          .join("+");
        const sel = `not(${expr})`;
        await ffmpeg.exec([
          "-i", inputName,
          "-filter_complex",
          `[0:v]select='${sel}',setpts=N/FRAME_RATE/TB,${VIDEO_CHAIN}[v];` +
          `[0:a]aselect='${sel}',asetpts=N/SR/TB,${AUDIO_CHAIN}[a]`,
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "192k",
          outputName,
        ]);
      }
    }
  } finally {
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
  }
  return outputName;
}

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
