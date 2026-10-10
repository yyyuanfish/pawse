"""Generate the AI-generated Mimi footage with Gemini Omni Flash (SynthID-watermarked; labelled on screen).

python demo/real/make-mimi-clip.py .env /mnt/pawse-demo-out/mimi   (needs: pip install google-genai python-dotenv)

Writes mimi-16x9.mp4 (stage opening) and mimi-9x16.mp4 (the phone camera preview), then a still for the photo.
"""
import base64
import os
import subprocess
import sys
import time

from dotenv import dotenv_values
from google import genai

env, out = sys.argv[1], sys.argv[2]
client = genai.Client(api_key=dotenv_values(env)["GEMINI_API_KEY"])
SCENE = ("An orange tabby cat walks slowly across a bright Zurich apartment living room with a wooden floor and a tall "
         "wardrobe in the background. She is limping: she does not put weight on her front left paw and holds it slightly "
         "lifted, hopping on three legs, then sits down and looks up at the camera. Realistic, natural daylight, "
         "handheld smartphone footage filmed by the worried owner, gentle camera shake. Single continuous shot. "
         "No people visible, no text, no dialogue. Quiet room ambience only.")
for name, ratio in (("mimi-16x9", "16:9"), ("mimi-9x16", "9:16")):
    t = time.time()
    it = client.interactions.create(model="gemini-omni-1.1-flash", input=f"[0-8s] {SCENE}",
                                    response_format={"type": "video", "aspect_ratio": ratio, "resolution": "1080p"})
    path = os.path.join(out, name + ".mp4")
    with open(path, "wb") as f:
        f.write(base64.b64decode(it.output_video.data))
    print(name, f"{time.time() - t:.0f}s", os.path.getsize(path), "bytes", flush=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "2.5", "-i", os.path.join(out, "mimi-9x16.mp4"), "-frames:v", "1",
                "-vf", "scale=720:-1", "-q:v", "3", os.path.join(out, "mimi-still.jpg")], check=True)
