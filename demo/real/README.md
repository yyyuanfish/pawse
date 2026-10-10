# Real-app demo recording

Records the 2-minute Mimi demo from the **real app** (`/app/?live=1`), not the mock in `../mock/`. One command,
one uncut take, with the sound the app actually played.

| Beat | What runs | Live or simulated |
|---|---|---|
| Owner says "my cat Mimi is limping" | Gemini Live hears the line through a virtual microphone and answers out loud | Live (the owner's line is a pre-generated Gemini TTS clip, `owner-line.wav`) |
| Triage card | Gemini Live calls the care tool, the backend runs Gemini care triage | Live |
| Nearby clinics | Backend clinic search around Zurich | Live (Gemini Maps grounding, needs `GEMINI_API_KEY`) |
| German vet script | Gemini drafts the German script with English subtitles | Live |
| Vet and insurer calls | The app's phone rehearsal: Pawse's German lines spoken by Gradium | Gradium voice live, the vet's and insurer's replies simulated and labelled so on screen. Nothing is dialled |
| Summary | Plan page built from the steps above | Live UI over the simulated call results |

The stage around the phone shows a caption per beat and `LIVE` / `SIMULATED` badges, so nothing simulated is
presented as real.

## Run

Needs Linux with Xvfb, PulseAudio (`sudo apt-get install pulseaudio pulseaudio-utils xvfb`), ffmpeg, Node 20+,
`npm install` in `demo/`, the app built (`cd web && npm run build`) and the backend running with `GEMINI_API_KEY`
and `GRADIUM_API_KEY` in `.env`:

```sh
uvicorn pawse.app:app --host 127.0.0.1 --port 8765 &
bash demo/real/record-real.sh          # APP_URL=... to point at another server
```

Output in `/mnt/pawse-demo-out/` (`OUT_DIR=` to change): `pawse-demo-real.mp4` (deliverable, silent waits shortened to fit 2:00 by `make-cut.py`; speech is never cut), the raw `.mkv`, and `-marks.json` (when each
caption appeared). A failed beat stops the take and saves `-fail.png`.

To change the owner's spoken line: `python demo/real/make-owner-line.py "<text>" demo/real/owner-line.wav`
(Gemini TTS, reads `GEMINI_API_KEY` from `.env`).

## How the sound gets in

PulseAudio gets two null sinks. Chromium plays into `rec`, and ffmpeg records `rec.monitor` together with the X
screen, so picture and sound share one clock. The owner's line is played into `mic`, which Chromium sees as the
microphone `owner_mic`, and also into `rec` so viewers hear it. Every take differs a little: Gemini's wording and
timing are live.
