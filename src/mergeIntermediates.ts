import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { FileItem } from "./types";
import { detectSilences } from "./processFile";

export const VIDEO_W = 1280;
export const VIDEO_H = 720;
export const VIDEO_FPS = 25;
export const SAMPLE_RATE = 44100;

export const VIDEO_CHAIN =
  `scale=${VIDEO_W}:${VIDEO_H}:force_original_aspect_ratio=decrease,` +
  `pad=${VIDEO_W}:${VIDEO_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${VIDEO_FPS}`;
export const AUDIO_CHAIN =
  `aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;

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
): Promise<string> {
  const inputName = `m_in_${index}.${item.ext}`;
  const outputName = `m_mid_${index}.mp4`;
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
