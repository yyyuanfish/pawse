"""iOS Safari only starts Web Audio inside the tap that asked for it (WebKit engine, no Apple device needed).

The Chromium suite runs with --autoplay-policy=no-user-gesture-required, so it cannot catch a context that is
created after an await or in a React effect. This test drives the live call in Playwright's WebKit and records,
for every call AudioContext (16 kHz mic, 24 kHz playback), whether it was created during a tap. It is the WebKit
engine on Linux, not a real iPhone: docs/VALIDATION.md says so.
"""
import pytest

from e2e_helpers import FakeLive, guest_state, wait_for

# A tap is the synchronous dispatch of a click: capture on window opens it, bubbling back to window closes it.
TAP_SPY = """
(() => {
  let inTap = false; window.__ctx = [];
  addEventListener('click', () => { inTap = true; }, true);
  addEventListener('click', () => { inTap = false; });
  const Base = window.AudioContext || window.webkitAudioContext;
  class Spy extends Base {
    constructor(opts) { super(opts); window.__ctx.push({ ctx: this, rate: opts && opts.sampleRate, tapped: inTap }); }
  }
  window.AudioContext = Spy; window.webkitAudioContext = Spy;
  window.__calls = () => window.__ctx.filter(c => c.rate === 16000 || c.rate === 24000)
    .map(c => ({ rate: c.rate, tapped: c.tapped, state: c.ctx.state }));
})();
"""


@pytest.fixture
def webkit_page(playwright, app_server):
    browser = playwright.webkit.launch()
    context = browser.new_context(base_url=app_server, locale="en-US", viewport={"width": 390, "height": 844},
                                  permissions=["microphone"], service_workers="block", storage_state=guest_state(app_server))  # the SW would bypass page.route
    page = context.new_page()
    page.add_init_script(TAP_SPY)
    yield page
    context.close()
    browser.close()


def test_call_audio_contexts_are_created_inside_the_tap(webkit_page):
    page = webkit_page
    live = FakeLive(page)
    page.goto("/app/?live=1")
    page.get_by_role("button", name="EN", exact=True).click()
    page.locator(".start-btn").click()
    page.get_by_role("button", name="Agree and start").click()
    wait_for(page, lambda: live.frames("setup"), what="Live setup message")
    page.locator("nav.call-controls button").first.click()  # mic on: the old code built the mic context only now
    wait_for(page, lambda: len(live.audio_frames()) >= 3, what="mic audio frames")
    calls = page.evaluate("window.__calls()")
    assert sorted(c["rate"] for c in calls) == [16000, 24000], calls
    assert all(c["tapped"] for c in calls), f"an AudioContext was created outside the tap: {calls}"
    assert all(c["state"] == "running" for c in calls), calls
