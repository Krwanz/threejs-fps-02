// Synthesized sound effects: every sound is built from oscillators and filtered
// noise, so the game ships no audio files and makes no network requests.
// The context is created lazily on the first user gesture; in headless captures
// every call is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function noise(dur, filterType, freq, gain, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, slideTo = null, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(kind) {
      if (kind === 'rifle') { noise(0.12, 'lowpass', 1800, 0.9); tone(160, 0.09, 'square', 0.25, 60); }
      else { noise(0.09, 'bandpass', 2400, 0.7); tone(220, 0.07, 'square', 0.2, 90); }
    },
    dryFire() { tone(900, 0.04, 'square', 0.15); },
    reload() {
      tone(500, 0.05, 'square', 0.12);
      tone(350, 0.05, 'square', 0.12, null, 0.25);
      tone(700, 0.06, 'square', 0.15, null, 0.55);
    },
    hit() { tone(1400, 0.06, 'sine', 0.3); },
    kill() { tone(880, 0.08, 'sine', 0.3); tone(1320, 0.12, 'sine', 0.3, null, 0.08); },
    hurt() { noise(0.15, 'lowpass', 500, 0.5); tone(120, 0.15, 'sawtooth', 0.2, 70); },
    explosion() {
      noise(0.9, 'lowpass', 400, 1.0);
      tone(90, 0.8, 'sine', 0.8, 30);
      noise(0.3, 'highpass', 3000, 0.4);
    },
    footstep() { noise(0.07, 'lowpass', 400, 0.18); },
    plantBeep(final) { tone(final ? 1200 : 800, 0.08, 'sine', 0.25); },
    defuseBeep() { tone(1000, 0.08, 'sine', 0.25); tone(1000, 0.08, 'sine', 0.25, null, 0.12); },
    roundWin() { [523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', 0.3, null, i * 0.14)); },
    roundLose() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, null, i * 0.16)); },
    buy() { tone(660, 0.07, 'sine', 0.25); tone(990, 0.1, 'sine', 0.25, null, 0.07); },
    denied() { tone(180, 0.15, 'square', 0.2); },
  };
}
