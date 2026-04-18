import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { FileItem } from "./types";
import { detectSilences } from "./processFile";

export const SAMPLE_RATE = 44100;
export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 720;
export const DEFAULT_FPS = 25;
const MAX_FPS = 60;

export interface VideoTarget {
  width: number;
  height: number;
  fps: number;
}

const AUDIO_CHAIN =
  `aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;

function videoChain(t: VideoTarget): string {
  return (
    `scale=${t.width}:${t.height}:force_original_aspect_ratio=decrease,` +
    `pad=${t.width}:${t.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${t.fps}`
  );
}

export async function probeVideo(
  ffmpeg: FFmpeg,
  item: FileItem,
  index: number,
): Promise<VideoTarget | null> {
  const inputName = `probe_${index}.${item.ext}`;
  const lines: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    if (message.includes("Video:")) lines.push(message);
  };
  await ffmpeg.writeFile(inputName, await fetchFile(item.file));
  ffmpeg.on("log", onLog);
  try {
    await ffmpeg.exec(["-i", inputName, "-t", "0.01", "-f", "null", "-"]);
  } catch { /* header-only read may error; log was still captured */ }
  ffmpeg.off("log", onLog);
  try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }

  for (const line of lines) {
    const dim = line.match(/,\s*(\d{2,5})x(\d{2,5})/);
    const fps = line.match(/([\d.]+)\s*fps/);
    if (dim) {
      const w = parseInt(dim[1], 10);
      const h = parseInt(dim[2], 10);
      return {
        width: w % 2 === 0 ? w : w + 1,
        height: h % 2 === 0 ? h : h + 1,
        fps: fps ? Math.min(parseFloat(fps[1]), MAX_FPS) : DEFAULT_FPS,
      };
    }
  }
  return null;
}

export async function trimAudioIntermediate(
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

export async function trimVideoIntermediate(
  ffmpeg: FFmpeg,
  item: FileItem,
  index: number,
  stopSeconds: number,
  target: VideoTarget,
): Promise<string> {
  const inputName = `m_in_${index}.${item.ext}`;
  const outputName = `m_mid_${index}.mp4`;
  const chain = videoChain(target);
  await ffmpeg.writeFile(inputName, await fetchFile(item.file));
  try {
    if (item.kind === "audio") {
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
          `color=c=black:s=${target.width}x${target.height}:r=${target.fps}`,
          "-i", trimmed,
          "-shortest",
          "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
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
          "-vf", chain,
          "-af", AUDIO_CHAIN,
          "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
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
          `[0:v]select='${sel}',setpts=N/FRAME_RATE/TB,${chain}[v];` +
          `[0:a]aselect='${sel}',asetpts=N/SR/TB,${AUDIO_CHAIN}[a]`,
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
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
