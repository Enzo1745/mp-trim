import {
  SILENCE_MAX_MS,
  SILENCE_MIN_MS,
  SILENCE_STEP_MS,
} from "../utils";

interface Props {
  value: number;
  onChange: (value: number) => void;
}

export function SilenceSlider({ value, onChange }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <label
          htmlFor="silence-slider"
          className="text-sm font-medium text-zinc-200"
        >
          Silence cut threshold
        </label>
        <span className="text-sm text-zinc-300 font-mono tabular-nums">
          {value} ms
        </span>
      </div>
      <input
        id="silence-slider"
        type="range"
        min={SILENCE_MIN_MS}
        max={SILENCE_MAX_MS}
        step={SILENCE_STEP_MS}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500 cursor-pointer"
      />
    </div>
  );
}
