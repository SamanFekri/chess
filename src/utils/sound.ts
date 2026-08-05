/**
 * Sound effects, synthesised in the browser.
 *
 * No audio files: every sound here is a few oscillators and an envelope, which
 * keeps the app a single small download that still works offline, and means the
 * effects load instantly rather than arriving some time after the first move.
 * The vocabulary is deliberately small and short — a chess app you hear on every
 * move gets annoying fast, so each cue is under a third of a second and the
 * pitches sit in a register that stays soft on phone speakers.
 */

export type SoundName =
  | 'move'
  | 'capture'
  | 'castle'
  | 'promote'
  | 'check'
  | 'win'
  | 'lose'
  | 'draw';

/** Master level. Low on purpose: these play constantly. */
const MASTER_GAIN = 0.22;

/** One synthesised note. Times are seconds from the start of the sound. */
interface Note {
  /** Starting frequency in Hz. */
  freq: number;
  /** Slides to this frequency across the note when set. */
  slideTo?: number;
  at: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}

/** A short burst of filtered noise — the thud under a capture. */
interface Noise {
  at: number;
  duration: number;
  gain: number;
  /** Low-pass cutoff; lower is duller and heavier. */
  cutoff: number;
}

interface Recipe {
  notes: Note[];
  noise?: Noise[];
}

/**
 * The sounds themselves.
 *
 * Kept as data rather than code so the whole palette can be read at once and
 * retuned without touching the playback path.
 */
const RECIPES: Record<SoundName, Recipe> = {
  // A soft wooden tap. Two fast triangle blips an octave apart read as "piece
  // meets board" far better than a single tone, which sounds like a UI beep.
  move: {
    notes: [
      { freq: 420, slideTo: 300, at: 0, duration: 0.075, gain: 0.5, type: 'triangle' },
      { freq: 210, slideTo: 160, at: 0.005, duration: 0.09, gain: 0.35, type: 'sine' },
    ],
  },

  // Lower, blunter, with a noise transient — something was taken off the board.
  capture: {
    notes: [
      { freq: 260, slideTo: 120, at: 0, duration: 0.13, gain: 0.55, type: 'triangle' },
      { freq: 90, at: 0.01, duration: 0.14, gain: 0.4, type: 'sine' },
    ],
    noise: [{ at: 0, duration: 0.07, gain: 0.35, cutoff: 1800 }],
  },

  // Two taps: the king, then the rook.
  castle: {
    notes: [
      { freq: 380, slideTo: 300, at: 0, duration: 0.07, gain: 0.45, type: 'triangle' },
      { freq: 320, slideTo: 250, at: 0.11, duration: 0.08, gain: 0.45, type: 'triangle' },
    ],
  },

  // A rising major arpeggio — the one moment a pawn becomes something better.
  promote: {
    notes: [
      { freq: 523.25, at: 0, duration: 0.1, gain: 0.32, type: 'triangle' },
      { freq: 659.25, at: 0.075, duration: 0.1, gain: 0.32, type: 'triangle' },
      { freq: 783.99, at: 0.15, duration: 0.16, gain: 0.34, type: 'triangle' },
      { freq: 1046.5, at: 0.225, duration: 0.22, gain: 0.26, type: 'sine' },
    ],
  },

  // Two quick high notes: an alert, not a verdict.
  check: {
    notes: [
      { freq: 880, at: 0, duration: 0.07, gain: 0.24, type: 'square' },
      { freq: 1174.66, at: 0.085, duration: 0.09, gain: 0.2, type: 'square' },
    ],
  },

  // Major triad, rising and held.
  win: {
    notes: [
      { freq: 523.25, at: 0, duration: 0.16, gain: 0.3, type: 'triangle' },
      { freq: 659.25, at: 0.12, duration: 0.16, gain: 0.3, type: 'triangle' },
      { freq: 783.99, at: 0.24, duration: 0.34, gain: 0.32, type: 'triangle' },
      { freq: 1046.5, at: 0.36, duration: 0.4, gain: 0.22, type: 'sine' },
    ],
  },

  // The same shape falling into a minor third. Deliberately not a buzzer: you
  // lost a chess game, you are not being told off.
  lose: {
    notes: [
      { freq: 440, at: 0, duration: 0.18, gain: 0.28, type: 'triangle' },
      { freq: 349.23, at: 0.14, duration: 0.2, gain: 0.28, type: 'triangle' },
      { freq: 261.63, at: 0.3, duration: 0.42, gain: 0.3, type: 'sine' },
    ],
  },

  // Level: two of the same note, neither up nor down.
  draw: {
    notes: [
      { freq: 392, at: 0, duration: 0.16, gain: 0.28, type: 'triangle' },
      { freq: 392, at: 0.18, duration: 0.3, gain: 0.26, type: 'triangle' },
    ],
  },
};

let ctx: AudioContext | null = null;
let enabled = true;

/**
 * The shared audio context, created on first use.
 *
 * Browsers refuse to start audio before the user has interacted with the page,
 * so the context is built lazily and resumed on every play — the first attempt
 * may be silent, and everything after the first click or key press works.
 */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  try {
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    // Audio can be unavailable entirely (autoplay policy, no output device).
    // Silence is an acceptable outcome; a broken game is not.
    return null;
  }
}

/**
 * Nudges the audio context awake from a real user gesture.
 *
 * Called from the first interaction anywhere in the app so that the sound for
 * that same interaction is not the one lost to the autoplay policy.
 */
export function primeAudio(): void {
  if (!enabled) return;
  audio();
}

/** Turns all sound on or off. */
export function setSoundEnabled(value: boolean): void {
  enabled = value;
  // Suspending rather than closing: a closed context cannot be reopened, and
  // unmuting has to work without a page reload.
  if (!value && ctx && ctx.state === 'running') void ctx.suspend();
  if (value) audio();
}

/** Plays one of the effects. Does nothing when muted or unsupported. */
export function playSound(name: SoundName): void {
  if (!enabled) return;

  const context = audio();
  if (!context) return;

  const recipe = RECIPES[name];
  const start = context.currentTime;

  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(context.destination);

  for (const note of recipe.notes) {
    const oscillator = context.createOscillator();
    oscillator.type = note.type ?? 'triangle';

    const at = start + note.at;
    oscillator.frequency.setValueAtTime(note.freq, at);
    if (note.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, at + note.duration);
    }

    // A few milliseconds of attack, then an exponential decay: ramping to a
    // hard zero clicks, and exponential ramps cannot reach zero at all, hence
    // the tiny floor.
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(note.gain, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);

    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(at);
    oscillator.stop(at + note.duration + 0.02);
  }

  for (const burst of recipe.noise ?? []) {
    const frames = Math.max(1, Math.floor(context.sampleRate * burst.duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      // Faded across the burst so it lands as a transient rather than a hiss.
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = burst.cutoff;

    const gain = context.createGain();
    gain.gain.value = burst.gain;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start + burst.at);
  }
}

/**
 * Picks the sound a move should make.
 *
 * Order matters: a promotion that also captures is a promotion first — it is the
 * rarer and more consequential of the two, and only one sound can play.
 */
export function soundForMove(move: {
  flags: string;
  captured?: string | null;
  promotion?: string | null;
}): SoundName {
  if (move.promotion) return 'promote';
  // `k` and `q` are chess.js's kingside/queenside castling flags.
  if (move.flags.includes('k') || move.flags.includes('q')) return 'castle';
  if (move.captured) return 'capture';
  return 'move';
}
