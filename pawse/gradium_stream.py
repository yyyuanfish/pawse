"""Gradium streaming STT and TTS over WebSocket, for live calls.

Runs in ulaw_8000, the format Twilio Media Streams send and play, so call audio
passes between the phone network and Gradium without conversion. The REST
endpoints in voice.py stay the right tool for one-off previews and cloning.
"""
import base64
import json
import os
from collections.abc import AsyncIterator

from websockets.asyncio.client import ClientConnection, connect

STT_URL = "wss://api.gradium.ai/api/speech/asr"
TTS_URL = "wss://api.gradium.ai/api/speech/tts"
DEFAULT_VOICES = {"de": "p6Uutkyi3j2iNAUu", "en": "YTpq7expH9539ERJ"}


class GradiumError(RuntimeError):
    pass


def _headers():
    key = os.getenv("GRADIUM_API_KEY")
    if not key:
        raise GradiumError("Set GRADIUM_API_KEY in the local .env")
    return {"x-api-key": key}


def voice_for(language):
    """The owner's approved German voice if configured, else Gradium's standard voice."""
    if language == "de":
        return os.getenv("GRADIUM_VOICE_ID_DE") or os.getenv("GRADIUM_STANDARD_VOICE_ID_DE") or DEFAULT_VOICES["de"]
    return DEFAULT_VOICES.get(language, DEFAULT_VOICES["en"])


def _check(msg):
    if msg.get("type") == "error":
        raise GradiumError(f"{msg.get('message')} (code {msg.get('code')})")
    return msg


class STT:
    """One transcription session per call leg. Messages: text, end_text, step (VAD every 80 ms), flushed."""

    def __init__(self, language="de", input_format="ulaw_8000", delay_in_frames=10):
        self.setup = {"type": "setup", "model_name": "default", "input_format": input_format,
                      "json_config": {"language": language, "delay_in_frames": delay_in_frames}}
        self.ws: ClientConnection | None = None

    async def open(self):
        self.ws = await connect(STT_URL, additional_headers=_headers(), max_size=None)
        await self.ws.send(json.dumps(self.setup))

    async def send_audio(self, audio: bytes):
        await self.ws.send(json.dumps({"type": "audio", "audio": base64.b64encode(audio).decode()}))

    async def flush(self, flush_id: int):
        await self.ws.send(json.dumps({"type": "flush", "flush_id": flush_id}))

    async def end(self):
        await self.ws.send(json.dumps({"type": "end_of_stream"}))

    async def messages(self) -> AsyncIterator[dict]:
        async for raw in self.ws:
            yield _check(json.loads(raw))

    async def close(self):
        if self.ws:
            await self.ws.close()
            self.ws = None


class TTS:
    """One synthesis session per spoken reply: send sentences as they arrive, read audio chunks back."""

    def __init__(self, language="de", output_format="ulaw_8000", voice_id=None):
        self.setup = {"type": "setup", "model_name": "default", "voice_id": voice_id or voice_for(language),
                      "output_format": output_format}
        self.ws: ClientConnection | None = None

    async def open(self):
        self.ws = await connect(TTS_URL, additional_headers=_headers(), max_size=None)
        await self.ws.send(json.dumps(self.setup))

    async def send_text(self, text: str, flush=False):
        if text.strip():
            await self.ws.send(json.dumps({"type": "text", "text": text.strip() + (" <flush>" if flush else "")}))

    async def end(self):
        await self.ws.send(json.dumps({"type": "end_of_stream"}))

    async def audio(self) -> AsyncIterator[bytes]:
        async for raw in self.ws:
            msg = _check(json.loads(raw))
            if msg["type"] == "audio":
                yield base64.b64decode(msg["audio"])
            elif msg["type"] == "end_of_stream":
                return

    async def close(self):
        if self.ws:
            await self.ws.close()
            self.ws = None
