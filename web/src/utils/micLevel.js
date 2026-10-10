/** RMS of a time-domain buffer mapped to 0..1 (normal speech lands around 0.3-0.8). */
export function micLevel(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / (buf.length || 1));
  return Math.min(1, rms * 8);
}
