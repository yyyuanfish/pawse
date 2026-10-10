"""Fail a take whose owner's line is heard more (or less) than once.

check-owner-line.py <raw.mkv> <owner-line.wav>

The recorder plays the owner's line once. A second copy means foreign audio reached the recording (another take or an
audio test playing into the same PulseAudio), which repeats "Hi Pawse, my cat Mimi is limping" over the video.
Each 1.5 s slice of the line is found by normalised cross-correlation (8 kHz mono); a play counts when its start is
matched by the slice that opens the line.
"""
import subprocess
import sys

import numpy as np

RATE, SLICE, MATCH = 8000, 1.5, 0.45


def pcm(path):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, np.int16).astype(np.float32)


def starts(x, tpl):
    """Times (s) where tpl occurs in x."""
    t = tpl - tpl.mean()
    t /= np.linalg.norm(t)
    n, size = len(t), len(x) + len(t)
    c = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(t[::-1], size))[n - 1:len(x)]
    energy = np.concatenate([[0], np.cumsum(x.astype(np.float64) ** 2)])
    e = np.sqrt(energy[n:] - energy[:-n])[:len(c)]
    nc = np.where(e > 3000, c[:len(e)] / np.maximum(e, 1), 0)  # silence would divide by ~0
    peaks = []
    for i in np.flatnonzero(nc > MATCH):
        if not peaks or i - peaks[-1][0] > RATE // 2:
            peaks.append([i, nc[i]])
        elif nc[i] > peaks[-1][1]:
            peaks[-1] = [i, nc[i]]
    return [i / RATE for i, _ in peaks]


raw, owner = pcm(sys.argv[1]), pcm(sys.argv[2])
plays = starts(raw, owner[:int(SLICE * RATE)])
print(f"owner's line heard {len(plays)}x at {', '.join(f'{t:.1f}s' for t in plays) or '-'} in {sys.argv[1]}")
if len(plays) != 1:
    sys.exit("Foreign or missing owner audio: record again, with nothing else playing into this take's PulseAudio.")
