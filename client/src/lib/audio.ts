let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }

  return audioContext;
}

export async function primeChimeAudio(): Promise<boolean> {
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

export async function playGentleChime(): Promise<boolean> {
  const ready = await primeChimeAudio();
  const context = getAudioContext();
  if (!ready || !context) {
    return false;
  }

  const start = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, start);

  const notes: Array<{ frequency: number; at: number; duration: number }> = [
    { frequency: 740, at: start, duration: 0.18 },
    { frequency: 988, at: start + 0.16, duration: 0.22 },
  ];

  for (const note of notes) {
    const oscillator = context.createOscillator();
    const noteGain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, note.at);

    noteGain.gain.setValueAtTime(0.0001, note.at);
    noteGain.gain.exponentialRampToValueAtTime(0.045, note.at + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, note.at + note.duration);

    oscillator.connect(noteGain);
    noteGain.connect(gain);
    oscillator.start(note.at);
    oscillator.stop(note.at + note.duration);
  }

  return true;
}
