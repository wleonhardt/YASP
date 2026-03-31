let audioContext: AudioContext | null = null;

type ToneSpec = {
  at: number;
  duration: number;
  frequency: number;
  endFrequency?: number;
  volume: number;
  type?: OscillatorType;
};

type TimerTickMode = "slow" | "fast";

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }

  return audioContext;
}

export function isRoomAudioPrimed(): boolean {
  return audioContext?.state === "running";
}

export async function primeRoomAudio(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) {
    return false;
  }

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }

  return context.state === "running";
}

function scheduleTone(context: AudioContext, destination: AudioNode, startAt: number, tone: ToneSpec): void {
  const noteStart = startAt + tone.at;
  const noteEnd = noteStart + tone.duration;
  const oscillator = context.createOscillator();
  const noteGain = context.createGain();

  oscillator.type = tone.type ?? "triangle";
  oscillator.frequency.setValueAtTime(tone.frequency, noteStart);
  if (tone.endFrequency) {
    oscillator.frequency.linearRampToValueAtTime(tone.endFrequency, noteEnd);
  }

  noteGain.gain.setValueAtTime(0.0001, noteStart);
  noteGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.volume), noteStart + 0.015);
  noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

  oscillator.connect(noteGain);
  noteGain.connect(destination);
  oscillator.start(noteStart);
  oscillator.stop(noteEnd);
}

/** Dedup map: prevents the same sound from being scheduled more than once per call site within a short window (React Strict Mode fires effects twice). */
const lastPlayedAt = new Map<string, number>();
const DEDUP_WINDOW_MS = 80;

async function playSequence(tones: ToneSpec[], key?: string): Promise<boolean> {
  if (key) {
    const now = performance.now();
    const last = lastPlayedAt.get(key);
    if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
      return true;
    }
    lastPlayedAt.set(key, now);
  }

  const ready = await primeRoomAudio();
  const context = getAudioContext();
  if (!ready || !context) {
    return false;
  }

  const start = context.currentTime + 0.01;
  const masterGain = context.createGain();
  masterGain.connect(context.destination);
  masterGain.gain.setValueAtTime(0.9, start);

  for (const tone of tones) {
    scheduleTone(context, masterGain, start, tone);
  }

  return true;
}

export async function playTimerStart(): Promise<boolean> {
  return playSequence(
    [
      {
        at: 0,
        duration: 0.14,
        frequency: 392,
        endFrequency: 440,
        volume: 0.12,
        type: "sine",
      },
      {
        at: 0.07,
        duration: 0.2,
        frequency: 523,
        endFrequency: 587,
        volume: 0.14,
        type: "triangle",
      },
      {
        at: 0.08,
        duration: 0.22,
        frequency: 196,
        endFrequency: 220,
        volume: 0.05,
        type: "sine",
      },
    ],
    "start"
  );
}

function playTimerTickWithMode(mode: TimerTickMode): Promise<boolean> {
  return playSequence(
    mode === "slow"
      ? [
          {
            at: 0,
            duration: 0.12,
            frequency: 740,
            endFrequency: 680,
            volume: 0.14,
            type: "triangle",
          },
          {
            at: 0.01,
            duration: 0.09,
            frequency: 1480,
            endFrequency: 1320,
            volume: 0.05,
            type: "sine",
          },
        ]
      : [
          {
            at: 0,
            duration: 0.09,
            frequency: 980,
            endFrequency: 900,
            volume: 0.16,
            type: "triangle",
          },
          {
            at: 0.008,
            duration: 0.07,
            frequency: 1960,
            endFrequency: 1800,
            volume: 0.055,
            type: "sine",
          },
        ],
    "tick"
  );
}

export async function playTimerTick(mode: TimerTickMode = "fast"): Promise<boolean> {
  return playTimerTickWithMode(mode);
}

export async function playTimerComplete(): Promise<boolean> {
  return playSequence(
    [
      {
        at: 0,
        duration: 0.22,
        frequency: 784,
        endFrequency: 830,
        volume: 0.14,
        type: "sine",
      },
      {
        at: 0.15,
        duration: 0.32,
        frequency: 1047,
        endFrequency: 1108,
        volume: 0.15,
        type: "triangle",
      },
      {
        at: 0.3,
        duration: 0.52,
        frequency: 1319,
        endFrequency: 1397,
        volume: 0.14,
        type: "sine",
      },
      {
        at: 0.16,
        duration: 0.58,
        frequency: 523,
        endFrequency: 494,
        volume: 0.05,
        type: "sine",
      },
    ],
    "complete"
  );
}

export async function playTimerHonk(): Promise<boolean> {
  return playSequence(
    [
      {
        at: 0,
        duration: 0.13,
        frequency: 554,
        endFrequency: 500,
        volume: 0.12,
        type: "triangle",
      },
      {
        at: 0.02,
        duration: 0.12,
        frequency: 277,
        endFrequency: 250,
        volume: 0.045,
        type: "sine",
      },
      {
        at: 0.17,
        duration: 0.15,
        frequency: 659,
        endFrequency: 587,
        volume: 0.12,
        type: "triangle",
      },
      {
        at: 0.19,
        duration: 0.14,
        frequency: 330,
        endFrequency: 294,
        volume: 0.05,
        type: "sine",
      },
    ],
    "honk"
  );
}

export const primeChimeAudio = primeRoomAudio;
export const playGentleChime = playTimerComplete;
