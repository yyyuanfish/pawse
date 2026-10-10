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

The opening has a narrator (`narrator-intro.wav`, Gemini TTS voice Charon, about 12 s) played into `rec` only, so
Gemini Live never hears it; the clip's own sound drops under it and the app starts only after it ends. Skip it with
`NARRATION_WAV= bash demo/real/record-real.sh`. To change it: `python demo/real/make-owner-line.py "<text>"
demo/real/narrator-intro.wav Charon` (write Pawse as "Pause" so TTS says it right).

## How the sound gets in

Each take starts its own private PulseAudio server (`PULSE_SERVER` in the env) with two null sinks. Chromium plays
into `rec`, and ffmpeg records `rec.monitor` together with the X screen, so picture and sound share one clock. The
owner's line is played into `mic`, which Chromium sees as the microphone `owner_mic`, and also into `rec` so viewers
hear it. Every take differs a little: Gemini's wording and timing are live.

The server is private because anything else playing into a shared daemon's `rec` (another take, an audio test) is
recorded too: takes 2 and 3 heard the owner's line 8 and 5 times over the video. `check-owner-line.py` fails the take
before the cut unless the line is heard exactly once. Takes can run side by side (Xvfb and the stage port are picked
free too).
