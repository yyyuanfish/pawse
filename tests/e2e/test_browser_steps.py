"""The step-by-step flow of the React app: one call-to-action per screen, a progress rail, one hand-off sub-step at a time.

Backend endpoints that would need provider keys are mocked with page.route. Screenshots land in test-results/steps/.
"""
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect

from e2e_helpers import FakeLive, wait_for

SHOTS = Path(__file__).resolve().parents[2] / "test-results" / "steps"
SIZES = [(390, 844), (1280, 800)]
CARE = {"care": {"assessment": {"urgency": "urgent", "summary": "Mimi is limping after a jump.",
                                "questions": ["Did she fall or jump?"], "services_to_ask_about": []}}}
CLINIC = {"id": "c1", "name": "Tierarztpraxis Seefeld", "address": "Seefeldstrasse 1, Zurich", "phone": "+41 44 000 00 00",
          "call_url": "tel:+41440000000", "open_now": True, "distance_km": 1.2, "source": "openstreetmap",
          "retrieved_at": "2026-10-10"}
# 0.1 s of 8 kHz mono 16-bit silence
WAV = (b"RIFF" + (36 + 1600).to_bytes(4, "little") + b"WAVEfmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little")
       + (1).to_bytes(2, "little") + (8000).to_bytes(4, "little") + (16000).to_bytes(4, "little") + (2).to_bytes(2, "little")
       + (16).to_bytes(2, "little") + b"data" + (1600).to_bytes(4, "little") + bytes(1600))


def shot(page: Page, name: str):
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=SHOTS / f"{name}-{page.viewport_size['width']}x{page.viewport_size['height']}.png", full_page=True)


def mock_backend(page: Page):
    page.route("**/api/v1/voice/status", lambda r: r.fulfill(json={"gradium_configured": True, "my_voice_ready": False}))
    page.route("**/api/v1/voice/scripts", lambda r: r.fulfill(json={
        "lines": [{"german": "Guten Tag, hier spricht die Besitzerin von Mimi.", "subtitle": "Hello, this is Mimi's owner."}]}))
    page.route("**/api/v1/voice/speech", lambda r: r.fulfill(body=WAV, content_type="audio/wav"))
    page.route("**/api/v1/clinics/search", lambda r: r.fulfill(json={
        "status": "complete", "clinics": [CLINIC], "warnings": [], "elapsed_ms": 1, "search_url": "", "completeness": "partial"}))
    page.route("**/api/v1/knowledge/evidence", lambda r: r.fulfill(json={"evidence": []}))


def reach_plan(page: Page):
    """Live conversation → triage (sheet) → 'Done' → plan screen."""
    mock_backend(page)
    page.context.grant_permissions(["geolocation"])
    page.context.set_geolocation({"latitude": 47.37, "longitude": 8.54})
    live = FakeLive(page, tool_ui={"assess_and_find_vets": CARE})
    page.goto("/app/?live=1")
    page.locator(".start-btn").click()
    page.get_by_role("button", name="Agree and start").click()
    wait_for(page, lambda: live.frames("setup"), what="Live setup")
    live.push({"serverContent": {"outputTranscription": {"text": "Hello, I am Pawse."}}})
    live.push({"toolCall": {"functionCalls": [{"id": "fc-t", "name": "assess_and_find_vets", "args": {}}]}})
    expect(page.locator(".sheet .step-rail")).to_be_visible()
    return live


@pytest.mark.parametrize("width,height", SIZES)
def test_home_has_one_call_to_action_and_hides_settings(page: Page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    page.goto("/app/")
    expect(page.locator(".start-btn")).to_have_count(1)
    expect(page.locator(".start-btn")).to_be_visible()
    settings = page.locator("details.home-settings")
    own_voice = page.get_by_role("button", name="Record my voice", exact=False)
    live_link = page.get_by_role("link", name="Use backend agents")
    expect(own_voice).to_be_hidden()
    expect(live_link).to_be_hidden()
    shot(page, "home")
    settings.locator("summary").click()
    expect(own_voice).to_be_visible()
    expect(live_link).to_be_visible()


def test_step_rail_marks_talk_current_then_done(page: Page):
    reach_plan(page)
    rail = page.locator(".sheet .step-rail")
    items = rail.locator("li")
    expect(items).to_have_count(5)  # Talk · Vet · Insurance · Decide · Summary
    expect(rail.locator("li[aria-current=step]")).to_have_count(1)
    expect(items.nth(0)).to_have_attribute("aria-current", "step")  # still on the call: Talk is current
    expect(items.nth(0)).to_contain_text("Talk")
    expect(items.nth(1)).not_to_have_class("done")
    page.get_by_role("button", name="Done", exact=True).click()  # leave the call: Talk is finished, Vet is next
    rail = page.locator("main.plan .step-rail")
    items = rail.locator("li")
    expect(items.nth(0)).to_have_class("done")
    expect(items.nth(1)).to_have_attribute("aria-current", "step")
    expect(items.nth(1)).to_contain_text("Vet")
    expect(rail.locator("li[aria-current=step]")).to_have_count(1)
    # exactly one primary action on the plan: the vet row
    primary = page.locator(".action-row button.btn.primary")
    expect(primary).to_have_count(1)
    expect(primary.locator("xpath=ancestor::div[contains(@class,'action-row')]")).to_contain_text("vet")


@pytest.mark.parametrize("width,height", SIZES)
def test_live_handoff_walks_one_substep_at_a_time(page: Page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    reach_plan(page)
    page.get_by_role("button", name="Done", exact=True).click()  # sheet → plan screen
    expect(page.locator("main.plan")).to_be_visible()
    shot(page, "plan")
    page.locator(".action-row button.btn.primary").click()
    # clinic list
    expect(page.get_by_text("Tierarztpraxis Seefeld")).to_be_visible()
    expect(page.locator(".step-rail li[aria-current=step]")).to_contain_text("Vet")
    page.get_by_role("button", name="Prepare conversation").click()

    substep = page.locator("section.substep")
    # 1 facts
    expect(page.get_by_role("heading", name="1 · What should the vet know?")).to_be_visible()
    expect(substep).to_have_count(1)
    expect(page.locator(".step-rail li[aria-current=step]")).to_contain_text("Vet")
    shot(page, "handoff-1-facts")
    draft = page.get_by_role("button", name="Draft German script")
    expect(draft).to_be_disabled()
    page.get_by_label("Share these facts with Gemini", exact=False).check()
    draft.click()
    # 2 script
    expect(page.get_by_role("heading", name="2 · Review the German script")).to_be_visible()
    expect(substep).to_have_count(1)
    expect(page.locator("select")).to_have_value("standard")  # regression: no own voice yet, so never "my_voice"
    expect(page.get_by_text("No own German voice is ready yet")).to_have_count(0)
    shot(page, "handoff-2-script")
    page.get_by_label("I reviewed the script", exact=False).check()
    page.get_by_role("button", name="Make audio").click()
    # 3 ready
    expect(page.get_by_role("heading", name="3 · Ready")).to_be_visible()
    expect(substep).to_have_count(1)
    expect(page.locator("audio")).to_have_count(1)
    shot(page, "handoff-3-ready")
    page.get_by_role("button", name="Done, back to plan").click()

    # plan: vet prepared, insurer is the single primary action
    rows = page.locator(".action-row")
    expect(rows.nth(0)).to_contain_text("Prepared, no call placed")
    expect(rows.nth(1)).not_to_contain_text("Prepared")
    primary = page.locator(".action-row button.btn.primary")
    expect(primary).to_have_count(1)
    expect(rows.nth(1).locator("button.btn.primary")).to_have_count(1)
    expect(page.locator(".step-rail li[aria-current=step]")).to_contain_text("Insurance")
    shot(page, "plan-after-vet")


def test_skipping_audio_still_completes_the_step(page: Page):
    reach_plan(page)
    page.get_by_role("button", name="Done", exact=True).click()
    page.locator(".action-row button.btn.primary").click()
    page.get_by_role("button", name="Prepare conversation").click()
    page.get_by_label("Share these facts with Gemini", exact=False).check()
    page.get_by_role("button", name="Draft German script").click()
    page.get_by_role("button", name="Skip audio").click()
    expect(page.locator("section.substep")).to_have_count(1)
    expect(page.get_by_text("No audio made")).to_be_visible()
    page.get_by_role("button", name="Done, back to plan").click()
    expect(page.locator(".action-row").nth(0)).to_contain_text("Prepared, no call placed")


def test_first_open_asks_to_sign_in_and_remembers_continue_as_guest(browser, browser_context_args):
    context = browser.new_context(**{**browser_context_args, "storage_state": None})  # a browser that never chose
    try:
        page = context.new_page()
        page.goto("/app/")
        expect(page.get_by_role("heading", name="Welcome to Pawse")).to_be_visible()
        expect(page.locator(".start-btn")).to_have_count(0)
        page.get_by_role("button", name="Continue as guest").click()
        expect(page.locator(".start-btn")).to_be_visible()
        page.reload()
        expect(page.locator(".start-btn")).to_be_visible()  # the guest choice is remembered on this device
        expect(page.get_by_role("heading", name="Welcome to Pawse")).to_have_count(0)
    finally:
        context.close()
