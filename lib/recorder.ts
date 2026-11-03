/** Records the mic until the speaker pauses; resolves to base64 16 kHz mono WAV, or null if nothing was said. */
export function startRecording(): { done: Promise<string | null>; stop: () => void } {
  let stopNow = () => {};
  const done = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(stream);
    // shortcut: ScriptProcessor is deprecated but works in every WebView; move to AudioWorklet if it's ever removed.
    const proc = ac.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    let spoke = false, quiet = 0, total = 0, over = false;
    return new Promise<string | null>((resolve) => {
      const finish = () => {
        if (over) return;
        over = true;
        proc.disconnect();
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        const rate = ac.sampleRate;
        ac.close();
        resolve(spoke ? toWav(chunks, rate) : null);
      };
      stopNow = finish;
      proc.onaudioprocess = (e) => {
        const d = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(d);
        const sec = d.length / ac.sampleRate;
        total += sec;
        let s = 0;
        for (const v of d) s += v * v;
        if (Math.sqrt(s / d.length) > 0.015) { spoke = true; quiet = 0; }
        else if (spoke) quiet += sec;
        if ((spoke && quiet > 1.2) || total > 12 || (!spoke && total > 6)) finish();
      };
      src.connect(proc);
      proc.connect(ac.destination);
    });
  })();
  return { done, stop: () => stopNow() };
}

function toWav(chunks: Float32Array[], rate: number): string {
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const step = rate / 16000;
  const n = Math.floor(all.length / step);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    let s = 0;
    for (let j = a; j < b && j < all.length; j++) s += all[j];
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s / (b - a))) * 32767, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
