let audioContext: AudioContext | null = null;

type ToneSpec = {
  at: number;
  duration: number;
  frequency: number;
  endFrequency?: number;
  volume: number;
  type?: OscillatorType;
};

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

async function playSequence(tones: ToneSpec[]): Promise<boolean> {
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

export async function playTimerTick(): Promise<boolean> {
  return playSequence([
    {
      at: 0,
      duration: 0.08,
      frequency: 880,
      endFrequency: 820,
      volume: 0.06,
      type: "triangle",
    },
  ]);
}

export async function playTimerComplete(): Promise<boolean> {
  return playSequence([
    {
      at: 0,
      duration: 0.18,
      frequency: 659,
      volume: 0.08,
      type: "sine",
    },
    {
      at: 0.14,
      duration: 0.22,
      frequency: 880,
      volume: 0.09,
      type: "triangle",
    },
    {
      at: 0.31,
      duration: 0.28,
      frequency: 988,
      volume: 0.08,
      type: "sine",
    },
  ]);
}

export async function playTimerHonk(): Promise<boolean> {
  return playSequence([
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
  ]);
}

export const primeChimeAudio = primeRoomAudio;
export const playGentleChime = playTimerComplete;
