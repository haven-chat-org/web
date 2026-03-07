/**
 * Synthesized sound effects for voice chat and notification events.
 * Uses the Web Audio API — no external audio files needed.
 * Sounds are short oscillator-based tones with smooth envelopes.
 */

export type SoundEffect =
  | "voiceJoin"
  | "voiceLeave"
  | "userJoin"
  | "userLeave"
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "screenShareStart"
  | "screenShareStop"
  | "newMessage"
  | "messageInCurrentChannel"
  | "callIncoming";

let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Play a single sine tone with a smooth attack/release envelope. */
function tone(
  context: AudioContext,
  freq: number,
  start: number,
  dur: number,
  vol: number,
) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);

  const attack = Math.min(0.008, dur * 0.15);
  const release = Math.min(0.015, dur * 0.3);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(vol, start + attack);
  gain.gain.setValueAtTime(vol, start + dur - release);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const effects: Record<SoundEffect, () => void> = {
  // Self joining — ascending two-note chime (G4 → B4)
  voiceJoin() {
    const c = ac(), t = c.currentTime;
    tone(c, 392, t, 0.08, 0.15);
    tone(c, 494, t + 0.08, 0.08, 0.15);
  },
  // Self leaving — descending two-note chime (B4 → G4)
  voiceLeave() {
    const c = ac(), t = c.currentTime;
    tone(c, 494, t, 0.08, 0.15);
    tone(c, 392, t + 0.08, 0.08, 0.15);
  },
  // Another user joins the channel
  userJoin() {
    const c = ac(), t = c.currentTime;
    tone(c, 830, t, 0.06, 0.1);
  },
  // Another user leaves the channel
  userLeave() {
    const c = ac(), t = c.currentTime;
    tone(c, 554, t, 0.06, 0.1);
  },
  // Mute microphone — low pop
  mute() {
    const c = ac(), t = c.currentTime;
    tone(c, 350, t, 0.04, 0.12);
  },
  // Unmute microphone — higher pop
  unmute() {
    const c = ac(), t = c.currentTime;
    tone(c, 550, t, 0.04, 0.12);
  },
  // Deafen — double low pop
  deafen() {
    const c = ac(), t = c.currentTime;
    tone(c, 280, t, 0.035, 0.12);
    tone(c, 280, t + 0.055, 0.035, 0.12);
  },
  // Undeafen — double higher pop
  undeafen() {
    const c = ac(), t = c.currentTime;
    tone(c, 480, t, 0.035, 0.12);
    tone(c, 480, t + 0.055, 0.035, 0.12);
  },
  // Screen share started — ascending C-E-G arpeggio
  screenShareStart() {
    const c = ac(), t = c.currentTime;
    tone(c, 523, t, 0.06, 0.1);
    tone(c, 659, t + 0.06, 0.06, 0.1);
    tone(c, 784, t + 0.12, 0.06, 0.1);
  },
  // Screen share stopped — descending G-E-C arpeggio
  screenShareStop() {
    const c = ac(), t = c.currentTime;
    tone(c, 784, t, 0.06, 0.1);
    tone(c, 659, t + 0.06, 0.06, 0.1);
    tone(c, 523, t + 0.12, 0.06, 0.1);
  },
  // New message notification — bright two-note ding (E5 → G5)
  newMessage() {
    const c = ac(), t = c.currentTime;
    tone(c, 659, t, 0.07, 0.12);
    tone(c, 784, t + 0.07, 0.09, 0.1);
  },
  // Subtle pop for messages in the channel you're currently viewing
  messageInCurrentChannel() {
    const c = ac(), t = c.currentTime;
    tone(c, 988, t, 0.025, 0.04);
  },
  // Incoming call ringtone chime (single ring cycle: C5 → E5 → G5)
  callIncoming() {
    const c = ac(), t = c.currentTime;
    tone(c, 523, t, 0.12, 0.15);
    tone(c, 659, t + 0.12, 0.12, 0.15);
    tone(c, 784, t + 0.24, 0.18, 0.15);
  },
};

export function playSound(effect: SoundEffect): void {
  try {
    effects[effect]();
  } catch {
    // AudioContext not available or suspended
  }
}

// ─── Ringtone (looping) ──────────────────────────────────────────────────────

let ringtoneInterval: ReturnType<typeof setInterval> | null = null;

/** Start a repeating ringtone for incoming calls. Loops every 2s until stopped. */
export function startRingtone(): void {
  stopRingtone();
  try {
    effects.callIncoming();
    ringtoneInterval = setInterval(() => {
      try { effects.callIncoming(); } catch { /* noop */ }
    }, 2000);
  } catch {
    // AudioContext not available
  }
}

/** Stop the repeating ringtone. */
export function stopRingtone(): void {
  if (ringtoneInterval !== null) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}
