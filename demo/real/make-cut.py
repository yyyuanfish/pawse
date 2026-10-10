"""Cut the uncut real-app take down to the target length by shortening silent waits only.

make-cut.py <raw.mkv> <out.mp4> [target_seconds]

Every stretch where nothing is heard (Gemini or Gradium latency, the simulated replies shown as text)
is shortened to a short pause; speech is never cut or sped up. The pause length shrinks until the
video fits the target. The opening hook is kept whole so its caption can be read.

Video is cut with one streaming `select` (frames outside the kept spans are dropped as they pass), never
with one `trim` per segment into `concat`: that queues every later segment's raw frames in RAM (~90 MB/s
at 1080p30) and froze the VM. Cut points sit on the frame grid so audio and video cut at the same times.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

raw, out = sys.argv[1], sys.argv[2]
target = float(sys.argv[3]) if len(sys.argv) > 3 else 120.0
PROTECT_HEAD = 6.0  # the hook caption (with the narrator, the caption beats below cover the rest)

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
marks_path = re.sub(r"\.\w+$", "-marks.json", raw)
marks = json.load(open(marks_path)) if os.path.exists(marks_path) else []

# Silent beats still have to be seen: each stage caption stays up at least BEAT_MIN seconds, and spans the recorder
# marks with "keep" (the Mimi camera preview, the final plan) are never shortened. Only the silence outside them is.
BEAT_MIN = 3.5
keep_from = {m["keep"]: m["t"] for m in marks if m.get("keep") and m.get("edge") == "start"}
protected = [(0.0, PROTECT_HEAD)] + [(m["t"], m["t"] + BEAT_MIN) for m in marks if m.get("caption")] + [
    (keep_from[m["keep"]], m["t"]) for m in marks if m.get("keep") in keep_from and m.get("edge") == "end"]


def outside(s, e):
    """Parts of the silence [s, e] not covered by a protected span."""
    parts = [(s, e)]
    for a, b in protected:
        parts = [q for x, y in parts for q in ((x, min(y, a)), (max(x, b), y)) if q[1] > q[0]]
    return parts


silences = [q for s, e in zip(starts, ends + [duration]) for q in outside(s, e)]


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


# Calls (marked by record-real.mjs in <raw>-marks.json) keep their opening seconds at normal speed, then play sped up
# with the German lowered under the subtitles, as the demo script asks. The speed is what fits the target, at most 4x.
CALL_HEAD, CALL_TAIL, MAX_SPEED, FAST_VOLUME = 6.0, 1.0, 4.0, 0.35
starts_ = {m["call"]: m["t"] for m in marks if m.get("call") and m.get("edge") == "start"}
fast = [(snap(starts_[m["call"]] + CALL_HEAD), snap(m["t"] - CALL_TAIL)) for m in marks
        if m.get("call") and m.get("edge") == "end" and m["call"] in starts_ and m["t"] - CALL_TAIL > starts_[m["call"]] + CALL_HEAD]


def pieces(segs, speed):
    """Kept segments split at the fast ranges, as (start, end, speed)."""
    out = []
    for a, b in segs:
        cuts = sorted({a, b, *[x for f in fast for x in f if a < x < b]})
        for x, y in zip(cuts, cuts[1:]):
            inside = any(fa <= x and y <= fb for fa, fb in fast)
            out.append((x, y, speed if inside else 1.0))
    return out


def length(ps):
    return sum((b - a) / sp for a, b, sp in ps)


def fit(segs):
    normal = length(pieces(segs, 1.0)) - sum(b - a for a, b, sp in pieces(segs, 2.0) if sp > 1)
    quick = sum(b - a for a, b, sp in pieces(segs, 2.0) if sp > 1)
    if not quick:
        return 1.0
    return MAX_SPEED if target <= normal else min(MAX_SPEED, max(1.0, quick / (target - normal)))


pause = 3.0
while pause > 1.0 and length(pieces(keeps(pause), fit(keeps(pause)))) > target:
    pause -= 0.1
segs = keeps(pause)
speed = fit(segs)
ps = pieces(segs, speed)
total = length(ps)
print(f"raw {duration:.1f}s, {len(silences)} silences, pause {pause:.1f}s, {len(fast)} calls at {speed:.2f}x "
      f"-> {total:.1f}s in {len(ps)} pieces")

# Each kept frame keeps its own timestamp, mapped to the output clock (time cut before it removed, sped-up pieces
# compressed): x11grab drops frames under load, so renumbering frames would drift the picture ahead of the sound.
# -fps_mode cfr then fills dropped frames and drops surplus ones in the sped-up pieces.
# Half a frame of slack so a frame on a cut point lands in exactly one piece.
half, done, spans, maps, labels_on = 0.5 / fps, 0.0, [], [], []
for a, b, sp in ps:
    span = f"between({{}}\\,{a - half:.4f}\\,{b - half:.4f})"
    spans.append(span.format("t"))  # select calls the frame time t, setpts calls it T
    maps.append(f"{span.format('T')}*({done:.4f}+(T-{a:.4f})/{sp:.4f})")
    if sp > 1:
        labels_on.append(f"between(t\\,{done:.3f}\\,{done + (b - a) / sp:.3f})")
    done += (b - a) / sp
label = ""
if labels_on:
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    label = (f",drawtext=fontfile={font}:text='» call sped up ×{speed:.1f}, German audio lowered':fontsize=26:"
             f"fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=12:x=w-tw-40:y=40:enable='{'+'.join(labels_on)}'")
parts, labels = [f"[0:v]select='{'+'.join(spans)}',setpts='({'+'.join(maps)})/TB'{label}[v];"], []
for i, (a, b, sp) in enumerate(ps):
    tempo = "".join(f",atempo={x:.4f}" for x in ([2.0, sp / 2] if sp > 2 else [sp])) if sp > 1 else ""
    vol = f",volume={FAST_VOLUME}" if sp > 1 else ""
    d = (b - a) / sp
    parts.append(f"[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS{tempo}{vol},"
                 f"afade=t=in:d=0.03,afade=t=out:st={max(0, d - 0.03):.4f}:d=0.03[a{i}];")
    labels.append(f"[a{i}]")
graph = "".join(parts) + "".join(labels) + f"concat=n={len(ps)}:v=0:a=1[a0];[a0]loudnorm=I=-16:TP=-1.5:LRA=11[a]"

with tempfile.NamedTemporaryFile("w", suffix=".ffgraph", delete=False) as f:
    f.write(graph)
try:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-filter_complex_script", f.name,
                    "-map", "[v]", "-map", "[a]", "-fps_mode", "cfr", "-r", f"{fps:g}", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out], check=True)
finally:
    os.unlink(f.name)
