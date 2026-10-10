"""Opt-in spike for issue #3: Gradium streaming TTS -> STT round trip in phone audio (ulaw 8 kHz).

For each sentence: synthesize it over the TTS WebSocket, then stream that audio back into
the STT WebSocket in real time, as a phone call would. Reports time to first audio, end of
turn detection and transcript accuracy. Uses synthetic sentences only; spends Gradium credits.

    .venv/bin/python scripts/gradium_spike.py [--save out_dir]
"""
import argparse
import asyncio
import os
import re
import sys
import time
import wave
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pawse.gradium_stream import STT, TTS, voice_for  # noqa: E402

SENTENCES = [
    ("de", "Guten Tag, hier ist Pawse, die KI-Assistenz. Unsere Katze Mimi hinkt seit einer Stunde vorne links. "
           "Können Sie sie heute Nachmittag sehen?"),
    ("de", "Wir können sie heute um sechzehn Uhr dreissig in der Praxis sehen, oder heute Abend einen Hausbesuch machen."),
    ("en", "My cat is limping after jumping off the wardrobe. Can you find a vet that is open now?"),
]
CHUNK = 640            # 80 ms of ulaw at 8 kHz
SILENCE = b"\xff" * CHUNK  # ulaw digital silence
VAD_HORIZON, VAD_THRESHOLD = 1, 0.6  # 1 s horizon, as the call bridge uses


def words(text):
    return re.findall(r"[\wäöüß]+", text.lower())


def word_error_rate(reference, hypothesis):
    ref, hyp = words(reference), words(hypothesis)
    row = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, row[0] = row[0], i
        for j, h in enumerate(hyp, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (r != h))
    return row[-1] / max(len(ref), 1)


async def synthesize(language, text):
    tts = TTS(language)
    started = time.perf_counter()
    first = None
    chunks = []
    await tts.open()
    try:
        await tts.send_text(text)
        await tts.end()
        async for chunk in tts.audio():
            first = first or time.perf_counter()
            chunks.append(chunk)
    finally:
        await tts.close()
    audio = b"".join(chunks)
    return audio, (first - started) * 1000 if first else None, (time.perf_counter() - started) * 1000


async def transcribe_live(language, audio):
    """Stream at real-time pace, then silence; measure from the end of speech."""
    stt = STT(language)
    await stt.open()
    pieces, result = [], {"turn_end_ms": None, "last_text_ms": None}
    speech_end = None

    async def sender():
        nonlocal speech_end
        for i in range(0, len(audio), CHUNK):
            await stt.send_audio(audio[i:i + CHUNK])
            await asyncio.sleep(0.08)
        speech_end = time.perf_counter()
        for _ in range(25):  # 2 s of silence, like a caller waiting for an answer
            await stt.send_audio(SILENCE)
            await asyncio.sleep(0.08)
        await stt.flush(1)

    async def receiver():
        async for msg in stt.messages():
            now = time.perf_counter()
            if msg["type"] == "text":
                pieces.append(msg["text"])
                if speech_end:
                    result["last_text_ms"] = (now - speech_end) * 1000
            elif msg["type"] == "step" and speech_end and result["turn_end_ms"] is None:
                if msg["vad"][VAD_HORIZON]["inactivity_prob"] > VAD_THRESHOLD:
                    result["turn_end_ms"] = (now - speech_end) * 1000
            elif msg["type"] == "flushed":
                return

    try:
        await asyncio.wait_for(asyncio.gather(sender(), receiver()), timeout=60)
    finally:
        await stt.close()
    return " ".join(pieces), result


def ulaw_to_wav(path, audio):
    # Decode G.711 mu-law to 16-bit PCM without audioop (removed in Python 3.13).
    pcm = bytearray()
    for byte in audio:
        b = ~byte & 0xFF
        sign, exponent, mantissa = b & 0x80, (b >> 4) & 0x07, b & 0x0F
        sample = (((mantissa << 3) + 0x84) << exponent) - 0x84
        pcm += int(-sample if sign else sample).to_bytes(2, "little", signed=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(bytes(pcm))


async def main(save_dir):
    load_dotenv(ROOT / ".env")
    if not os.getenv("GRADIUM_API_KEY"):
        raise SystemExit("GRADIUM_API_KEY is not configured in .env")
    rows = []
    for n, (language, text) in enumerate(SENTENCES, 1):
        audio, first_ms, total_ms = await synthesize(language, text)
        seconds = len(audio) / 8000
        if save_dir:
            save_dir.mkdir(parents=True, exist_ok=True)
            ulaw_to_wav(save_dir / f"spike_{n}_{language}.wav", audio)
        transcript, timing = await transcribe_live(language, audio)
        rows.append((language, voice_for(language), first_ms, total_ms, seconds, timing["turn_end_ms"],
                     timing["last_text_ms"], word_error_rate(text, transcript), transcript))
        print(f"[{n}] {language}: {transcript}", flush=True)

    fmt = lambda v, unit="ms": "n/a" if v is None else f"{v:.0f} {unit}"  # noqa: E731
    print("\n| # | Lang | TTS first audio | TTS total | Audio | STT end of turn (after speech) | STT last text | WER |")
    print("|---|---|---|---|---|---|---|---|")
    for n, (lang, _, first, total, secs, turn, last, wer, _) in enumerate(rows, 1):
        print(f"| {n} | {lang} | {fmt(first)} | {fmt(total)} | {secs:.1f} s | {fmt(turn)} | {fmt(last)} | {wer:.0%} |")
    print("\nTTS voices:", ", ".join(sorted({f"{r[0]}={r[1]}" for r in rows})),
          f"· VAD: horizon index {VAD_HORIZON}, threshold {VAD_THRESHOLD} · audio: ulaw_8000 both ways")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--save", type=Path, help="write each synthesized sentence as a WAV here")
    asyncio.run(main(parser.parse_args().save))
