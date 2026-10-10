"""Generate the owner's spoken line for the demo with Gemini TTS: make-owner-line.py "<text>" <out.wav> [voice]."""
import os, sys, wave, base64
from pathlib import Path
import httpx
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env")
text, out = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "Kore"
body = {"contents": [{"parts": [{"text": text}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
          "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
r = httpx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
               headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, json=body, timeout=120)
if r.status_code != 200: print(r.status_code, r.text[:500]); sys.exit(1)
p = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
data = base64.b64decode(p["data"]); print(p["mimeType"], len(data))
if data[:4] == b"RIFF": open(out, "wb").write(data)
else:
    with wave.open(out, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(data)
