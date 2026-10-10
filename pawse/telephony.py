"""Real phone calls: Twilio dials the demo line and Pawse talks on it, one turn at a time.

Twilio trial accounts allow neither Media Streams nor most call parameters, so the call runs on TwiML
webhooks: Pawse's line is synthesised by Gradium and played with <Play>, Twilio's <Gather> speech
recognition hears the callee, and Gemini decides the next line. On a trial only verified numbers can
be dialled, so every call goes to DEMO_PHONE_NUMBER whatever clinic or insurer was chosen.
"""
import asyncio
import json
import logging
import os
import re
import secrets
import struct
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Literal
from urllib.parse import parse_qs, quote, urlparse
from xml.sax.saxutils import escape, quoteattr

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import Field

from . import store
from .models import Model

router = APIRouter(prefix="/api/v1/calls", tags=["Phone calls"])
log = logging.getLogger("uvicorn.error")
TWILIO = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls"
DISCLOSURE = "Hello, this is Pawse, an AI assistant calling on behalf of a cat owner."
DEFAULT_VOICE = "YTpq7expH9539ERJ"  # Gradium "Emma", the app's default English voice
MAX_SECONDS, MAX_TURNS, MAX_ACTIVE = 300, 14, 2
calls: dict[str, dict] = {}


class CallRequest(Model):
    target: Literal["vet", "insurer"] = "vet"
    place: str = Field(default="", max_length=200, description="Clinic or insurer the owner chose; spoken, not dialled.")
    summary: str = Field(min_length=1, max_length=2000, description="Case facts Pawse may share on the call.")
    voice_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9]{16}$")
    share_with_gemini: Literal[True]
    share_with_gradium: Literal[True]
    confirm_demo_line: Literal[True]


class CallStarted(Model):
    id: str
    state: str


class CallStatus(Model):
    configured: bool
    demo_line: str | None = None


def settings():
    keys = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "DEMO_PHONE_NUMBER", "PUBLIC_URL", "GEMINI_API_KEY", "GRADIUM_API_KEY"]
    values = {k: (os.getenv(k) or "").strip() for k in keys}
    return values if all(values.values()) and values["PUBLIC_URL"].startswith("https://") else None


def masked(number):
    return f"{number[:3]} ••• ••• {number[-2:]}" if len(number) > 6 else "the demo line"


@router.get("/status", response_model=CallStatus)
async def call_status():
    s = settings()
    return CallStatus(configured=bool(s), demo_line=masked(s["DEMO_PHONE_NUMBER"]) if s else None)


def emit(call, event):
    call["events"].append(event)
    for q in call["subs"]:
        q.put_nowait(event)


def finish(call, outcome=None):
    if call["state"] == "ended":
        return
    call["state"] = "ended"
    req, result = call["request"], outcome or call["outcome"]
    title = f"{'Vet' if req.target == 'vet' else 'Insurer'} call{' · ' + req.place if req.place else ''}"
    store.add(call.get("user"), "call", title, {"target": req.target, "place": req.place, "outcome": result,
                                                "lines": [{"who": w, "text": t} for w, t in call.get("history", [])]})
    emit(call, {"type": "status", "state": "ended", "outcome": outcome or call["outcome"]})


def mine(call_id, owner):
    call = calls.get(call_id)
    if not call or call["owner"] != owner:
        raise HTTPException(404, "Call not found.")
    return call


class TwilioError(RuntimeError):
    pass


async def twilio(s, method, path="", **data):
    url = TWILIO.format(sid=quote(s["TWILIO_ACCOUNT_SID"], safe="")) + path + ".json"
    async with httpx.AsyncClient() as client:
        r = await client.request(method, url, auth=(s["TWILIO_ACCOUNT_SID"], s["TWILIO_AUTH_TOKEN"]), data=data, timeout=20)
    if r.is_error:
        try:
            err = r.json()
            detail = f"Twilio error {err.get('code')}: {err.get('message')}"
        except ValueError:
            detail = f"Twilio HTTP {r.status_code}"
        detail = re.sub(r"\+?\d{7,}", "<number>", detail)  # never log phone numbers
        log.warning("twilio %s %s -> %s", method, path or "/Calls", detail)
        raise TwilioError(detail)
    return r.json()


@router.post("", response_model=CallStarted, status_code=201)
async def start_call(payload: CallRequest, request: Request):
    s = settings()
    if not s:
        raise HTTPException(503, "Phone calls are not configured: set the Twilio, Gemini and Gradium keys, DEMO_PHONE_NUMBER and an https PUBLIC_URL.")
    owner = request.state.owner
    for c in list(calls.values()):
        if c["state"] == "ended" and time.monotonic() - c["created"] > 3600:
            calls.pop(c["id"], None)
    active = [c for c in calls.values() if c["state"] != "ended"]
    if any(c["owner"] == owner for c in active) or len(active) >= MAX_ACTIVE:
        raise HTTPException(429, "A call is already running. Hang up first.")
    call_id = secrets.token_urlsafe(24)
    call = calls[call_id] = {"id": call_id, "owner": owner, "state": "dialing", "created": time.monotonic(), "events": [], "subs": set(),
                             "request": payload, "outcome": {"status": "unknown", "slot": None, "start": None, "note": ""}, "twilio_sid": None,
                             "history": [], "audio": {}, "sentences": {},
                             "user": store.user_for(request.cookies.get("pawse_user"))}
    base = s["PUBLIC_URL"].rstrip("/")
    # Trial accounts accept only basic parameters: Twilio fetches the instructions from our URL, and the
    # time limit and ringing/no-answer states are handled here (watch) instead of with callbacks.
    try:
        result = await twilio(s, "POST", To=s["DEMO_PHONE_NUMBER"], From=s["TWILIO_FROM_NUMBER"], Url=f"{base}/api/v1/calls/{call_id}/twiml")
        call["twilio_sid"] = result.get("sid")
        call["watch"] = asyncio.create_task(watch(s, call))
        # The disclosure never changes: voice it while the phone rings, so it plays the moment someone answers.
        call["audio"][0] = asyncio.create_task(synth(DISCLOSURE, payload.voice_id or DEFAULT_VOICE))
    except (httpx.HTTPError, ValueError, TwilioError) as e:
        calls.pop(call_id, None)
        reason = str(e) if isinstance(e, TwilioError) else "Twilio is unreachable"
        raise HTTPException(502, f"Twilio could not place the call ({reason}).") from None
    emit(call, {"type": "status", "state": "dialing", "place": payload.place, "target": payload.target})
    return CallStarted(id=call_id, state="dialing")


@router.post("/{call_id}/hangup", status_code=202)
async def hangup(call_id: str, request: Request):
    call = mine(call_id, request.state.owner)
    s = settings()
    if s and call["twilio_sid"] and call["state"] != "ended":
        try:
            await twilio(s, "POST", f"/{quote(call['twilio_sid'], safe='')}", Status="completed")
        except (httpx.HTTPError, TwilioError):
            pass
    finish(call)
    return {"state": "ended"}


async def watch(s, call):
    """Poll Twilio for ringing/no-answer/busy and enforce the time limit (callbacks need a paid account)."""
    path, seen = f"/{quote(call['twilio_sid'] or '', safe='')}", ""
    while call["state"] != "ended":
        await asyncio.sleep(3)
        if time.monotonic() - call["created"] > MAX_SECONDS:
            try:
                await twilio(s, "POST", path, Status="completed")
            except (httpx.HTTPError, TwilioError):
                pass
            finish(call)
            return
        try:
            status = (await twilio(s, "GET", path)).get("status", "")
        except (httpx.HTTPError, TwilioError, ValueError):
            continue
        if status == seen:
            continue
        seen = status
        if status == "ringing" and call["state"] == "dialing":
            emit(call, {"type": "status", "state": "ringing"})
        elif status in {"busy", "no-answer", "failed", "canceled"}:
            finish(call, {**call["outcome"], "status": "not_reached", "note": f"Call {status.replace('-', ' ')}."})
        elif status == "completed":
            finish(call)


@router.post("/{call_id}/twilio-status", include_in_schema=False)
async def twilio_status(call_id: str, request: Request):
    # Twilio's status webhook; the unguessable id in the URL is the shared secret.
    call = calls.get(call_id)
    if call:
        status = parse_qs((await request.body()).decode(errors="ignore")).get("CallStatus", [""])[0]
        if status in {"busy", "no-answer", "failed", "canceled"}:
            finish(call, {**call["outcome"], "status": "not_reached", "note": f"Call {status.replace('-', ' ')}."})
        elif status == "completed":
            finish(call)
        elif status == "ringing":
            emit(call, {"type": "status", "state": "ringing"})
    return {"ok": True}


@router.get("/{call_id}/events")
async def events(call_id: str, request: Request):
    call = mine(call_id, request.state.owner)
    q: asyncio.Queue = asyncio.Queue()
    for e in call["events"]:
        q.put_nowait(e)
    call["subs"].add(q)

    async def stream():
        try:
            while True:
                try:
                    e = await asyncio.wait_for(q.get(), 15)
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield f"data: {json.dumps(e)}\n\n"
                if e.get("type") == "status" and e.get("state") == "ended":
                    return
        finally:
            call["subs"].discard(q)

    return StreamingResponse(stream(), media_type="text/event-stream")


def instruction(req: CallRequest):
    who = "a veterinary clinic" if req.target == "vet" else "the owner's pet insurer"
    goal = ("Get the earliest appointment today (or the next day) for the cat and confirm the exact day and time. "
            "Share the case facts when asked.") if req.target == "vet" else (
            "Ask whether the policy covers this vet visit, the deductible, and how to submit the claim.")
    return (f"You are Pawse, an AI assistant on a phone call with {who}"
            f"{' (' + req.place + ')' if req.place else ''}, calling on behalf of a cat owner. You are an AI; never claim to be human. "
            "Speak English in short, natural phone sentences: at most two sentences per turn. "
            f"Goal: {goal} Never agree to payments or share personal data beyond the case facts. If you are asked something "
            "you do not know, say the owner will follow up. When the goal is reached, or the callee cannot help, thank them, "
            "say goodbye and end the call. The call already opened with: '" + DISCLOSURE + "' so never introduce yourself again.\n"
            f"Case facts: {req.summary}\n"
            f"It is now {datetime.now(ZURICH):%A %Y-%m-%d %H:%M} in Zurich.\n"
            'Reply with JSON only: {"say": string, "end_call": boolean, "outcome": {"status": "booked"|"no_slot"|"answered"|"unknown", '
            '"slot": string or null (the confirmed day and time, as said), "start": string or null (that slot as local Zurich time '
            'YYYY-MM-DDTHH:MM, only once a time is confirmed), "note": string (one-line result for the owner)}}')


async def next_line(req, history):
    key = os.getenv("GEMINI_API_KEY")
    model = quote(os.getenv("GEMINI_MODEL", "gemini-3-flash-preview"), safe="")
    turns = "\n".join(f"{'Pawse' if who == 'ai' else 'Callee'}: {text}" for who, text in history) or "(The callee just answered.)"
    async with httpx.AsyncClient() as client:
        r = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": key}, timeout=20,
            json={"systemInstruction": {"parts": [{"text": instruction(req)}]},
                  "contents": [{"role": "user", "parts": [{"text": f"Call so far:\n{turns}\n\nPawse's next turn:"}]}],
                  "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3, "thinkingConfig": {"thinkingLevel": "low"}}})
    r.raise_for_status()
    parts = r.json()["candidates"][0]["content"]["parts"]
    data = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
    say = str(data.get("say") or "").strip()[:600]
    outcome = data.get("outcome") if isinstance(data.get("outcome"), dict) else {}
    return say, bool(data.get("end_call")), outcome


def xml(body):
    return Response(f"<Response>{body}</Response>", media_type="application/xml")


def ulaw_wav(data: bytes) -> bytes:
    """Wrap raw 8 kHz mu-law (Gradium ulaw_8000) in a WAV header that Twilio's <Play> accepts."""
    fmt = struct.pack("<HHIIHHH", 7, 1, 8000, 8000, 1, 8, 0)
    body = b"WAVEfmt " + struct.pack("<I", len(fmt)) + fmt + b"fact" + struct.pack("<II", 4, len(data)) + b"data" + struct.pack("<I", len(data)) + data
    return b"RIFF" + struct.pack("<I", len(body)) + body


# Gradium rejects more than about two concurrent requests, so sentences queue here instead of failing.
gradium_slots = asyncio.Semaphore(2)


async def synth(text, voice_id):
    from .voice import gradium
    for attempt in range(3):
        try:
            async with gradium_slots, httpx.AsyncClient() as client:
                r = await gradium(client, "POST", "/post/speech/tts", max_bytes=5_000_000, request_timeout=20, json={
                    "text": text, "voice_id": voice_id, "model_name": "default", "output_format": "ulaw_8000", "only_audio": True})
            return ulaw_wav(r.content)
        except HTTPException:
            if attempt == 2:
                raise
            await asyncio.sleep(0.4 * (attempt + 1))


async def speak(call, text, end):
    """Pawse's line in Gradium's voice, one <Play> per sentence, then listen or hang up.

    Every sentence is synthesised in parallel as soon as the TwiML is returned; Twilio fetches them in
    order, so the first short sentence plays while the rest are still being generated."""
    call["history"].append(("ai", text))
    emit(call, {"type": "line", "who": "ai", "text": text})
    base = settings()["PUBLIC_URL"].rstrip("/")
    plays = ""
    for sentence in [x for x in re.split(r"(?<=[.!?])\s+", text) if x.strip()]:
        n = len(call["audio"])
        call["audio"][n] = asyncio.create_task(synth(sentence, call["request"].voice_id or DEFAULT_VOICE))
        call["sentences"][n] = sentence
        plays += f"<Play>{base}/api/v1/calls/{call['id']}/audio/{n}</Play>"
    if end or len(call["history"]) >= 2 * MAX_TURNS:
        return xml(plays + "<Hangup/>")
    turn = f"{base}/api/v1/calls/{call['id']}/turn"
    return xml(f'{plays}<Gather input="speech" action={quoteattr(turn)} method="POST" speechTimeout="auto" language="en-US"/>'
               f'<Redirect method="POST">{escape(turn)}?silence=1</Redirect>')


ZURICH = ZoneInfo("Europe/Zurich")


def slot_start(value):
    """The confirmed slot as 'YYYY-MM-DDTHH:MM' Zurich time, or None unless it is a plausible upcoming time."""
    try:
        start = datetime.fromisoformat(str(value)[:16]).replace(tzinfo=ZURICH)
    except (TypeError, ValueError):
        return None
    now = datetime.now(ZURICH)
    return start.strftime("%Y-%m-%dT%H:%M") if now - timedelta(hours=1) <= start <= now + timedelta(days=60) else None


def update_outcome(call, outcome):
    if outcome:
        call["outcome"] = {"status": str(outcome.get("status") or "unknown")[:20],
                           "slot": (str(outcome["slot"])[:120] if outcome.get("slot") else None),
                           "start": slot_start(outcome.get("start")),
                           "note": str(outcome.get("note") or "")[:300]}
        emit(call, {"type": "outcome", **call["outcome"]})


@router.api_route("/{call_id}/twiml", methods=["GET", "POST"], include_in_schema=False)
async def answered(call_id: str):
    # Twilio fetches this when the callee picks up: the pre-voiced AI disclosure plays at once while
    # Gemini writes the opening line, which /opening then speaks.
    call, s = calls.get(call_id), settings()
    if not call or call["state"] != "dialing" or not s:
        return xml("<Hangup/>")
    call["state"] = "connected"
    emit(call, {"type": "status", "state": "connected"})
    call["history"].append(("ai", DISCLOSURE))
    emit(call, {"type": "line", "who": "ai", "text": DISCLOSURE})
    call["opening"] = asyncio.create_task(next_line(call["request"], call["history"]))
    base = s["PUBLIC_URL"].rstrip("/")
    return xml(f"<Play>{base}/api/v1/calls/{call_id}/audio/0</Play><Redirect method=\"POST\">{base}/api/v1/calls/{call_id}/opening</Redirect>")


@router.post("/{call_id}/opening", include_in_schema=False)
async def opening(call_id: str):
    call = calls.get(call_id)
    if not call or call["state"] == "ended" or "opening" not in call:
        return xml("<Hangup/>")
    try:
        say, end, outcome = await asyncio.wait_for(call.pop("opening"), 12)
    except Exception:  # noqa: BLE001
        say, end, outcome = "I'm calling about a cat that needs to see a vet. Could I ask a few questions?", False, {}
    update_outcome(call, outcome)
    return await speak(call, say or "I'm calling to book an appointment for a cat.", end)


@router.post("/{call_id}/turn", include_in_schema=False)
async def turn(call_id: str, request: Request, silence: int = 0):
    # Twilio posts what the callee said (SpeechResult); Gemini picks Pawse's reply.
    call = calls.get(call_id)
    if not call or call["state"] == "ended" or not settings():
        return xml("<Hangup/>")
    form = {k: v[0] for k, v in parse_qs((await request.body()).decode(errors="ignore")).items()}
    heard = (form.get("SpeechResult") or "").strip()[:1000]
    if not heard:
        call["silences"] = call.get("silences", 0) + 1
        if call["silences"] >= 2:
            return await speak(call, "I can't hear anyone, so I'll call back later. Goodbye.", True)
        return await speak(call, "Sorry, I didn't catch that. Could you say it again?", False)
    call["history"].append(("callee", heard))
    emit(call, {"type": "line", "who": "callee", "text": heard})
    try:
        say, end, outcome = await next_line(call["request"], call["history"])
    except Exception:  # noqa: BLE001
        return await speak(call, "Sorry, I'm having technical trouble. The owner will call back. Goodbye.", True)
    update_outcome(call, outcome)
    return await speak(call, say or "Thank you. Goodbye.", end or not say)


@router.get("/{call_id}/audio/{n}", include_in_schema=False)
async def audio(call_id: str, n: int):
    call = calls.get(call_id)
    if not call or n not in call["audio"]:
        raise HTTPException(404, "No such audio.")
    try:
        return Response(await asyncio.wait_for(asyncio.shield(call["audio"][n]), 14), media_type="audio/wav")
    except Exception:  # noqa: BLE001 - an error here makes Twilio hang up, so play a short silence instead
        log.warning("call %s: Gradium could not voice sentence %s", call_id[:6], n)
        return Response(ulaw_wav(b"\xff" * 4000), media_type="audio/wav")
