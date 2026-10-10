"""Cut the uncut real-app take down to the target length by shortening silent waits only.

make-cut.py <raw.mkv> <out.mp4> [target_seconds]

Every stretch where nothing is heard (Gemini or Gradium latency, the simulated replies shown as text)
is shortened to a short pause; speech is never cut or sped up. The pause length shrinks until the
video fits the target. The opening hook is kept whole so its caption can be read.

Video is cut with one streaming `select` (frames outside the kept spans are dropped as they pass), never
with one `trim` per segment into `concat`: that queues every later segment's raw frames in RAM (~90 MB/s
at 1080p30) and froze the VM. Cut points sit on the frame grid so audio and video cut at the same times.
"""
import os
import re
import subprocess
import sys
import tempfile

raw, out = sys.argv[1], sys.argv[2]
target = float(sys.argv[3]) if len(sys.argv) > 3 else 120.0
PROTECT_HEAD = 6.0  # the hook caption

duration = float(subprocess.check_output(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw]).strip())
rate = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                "stream=r_frame_rate", "-of", "csv=p=0", raw], text=True).strip()
num, den = (rate.split("/") + ["1"])[:2]
fps = float(num) / float(den)
log = subprocess.run(["ffmpeg", "-i", raw, "-af", "silencedetect=noise=-45dB:d=1.5", "-vn", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
silences = [(max(s, PROTECT_HEAD), e) for s, e in zip(starts, ends + [duration]) if e > PROTECT_HEAD]


def snap(t):
    return round(t * fps) / fps


def keeps(pause):
    """Segments to keep when each silence is shortened to `pause` seconds (half before, half after)."""
    segs, t = [], 0.0
    for s, e in silences:
        if e - s <= pause:
            continue
        segs.append((t, s + pause / 2))
        t = e - pause / 2
    segs.append((t, duration))
    return [(snap(a), snap(b)) for a, b in segs if snap(b) > snap(a)]


pause = 3.0
while pause > 1.0 and sum(b - a for a, b in keeps(pause)) > target:
    pause -= 0.1
segs = keeps(pause)
total = sum(b - a for a, b in segs)
print(f"raw {duration:.1f}s, {len(silences)} silences, pause {pause:.1f}s -> {total:.1f}s in {len(segs)} segments")

# Each kept frame keeps its own timestamp minus the time cut before it (x11grab drops frames under load, so
# renumbering frames would drift the picture ahead of the sound); -fps_mode cfr then fills dropped frames.
# Half a frame of slack so a frame on a cut point lands in exactly one span.
half, done, spans, shifts = 0.5 / fps, 0.0, [], []
for a, b in segs:
    span = f"between({{}}\\,{a - half:.4f}\\,{b - half:.4f})"
    spans.append(span.format("t"))  # select calls the frame time t, setpts calls it T
    shifts.append(f"{span.format('T')}*{a - done:.4f}")
    done += b - a
parts, labels = [f"[0:v]select='{'+'.join(spans)}',setpts='PTS-({'+'.join(shifts)})/TB'[v];"], []
for i, (a, b) in enumerate(segs):
    parts.append(f"[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS,"
                 f"afade=t=in:d=0.03,afade=t=out:st={max(0, b - a - 0.03):.4f}:d=0.03[a{i}];")
    labels.append(f"[a{i}]")
graph = "".join(parts) + "".join(labels) + f"concat=n={len(segs)}:v=0:a=1[a0];[a0]loudnorm=I=-16:TP=-1.5:LRA=11[a]"

with tempfile.NamedTemporaryFile("w", suffix=".ffgraph", delete=False) as f:
    f.write(graph)
try:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-filter_complex_script", f.name,
                    "-map", "[v]", "-map", "[a]", "-fps_mode", "cfr", "-r", f"{fps:g}", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out], check=True)
finally:
    os.unlink(f.name)
