"""The second half of the Mimi story in the live React app (/app/?live=1): after the rehearsal vet and insurer
calls, the option cards, the confirmation call and the taxi call play the backend story (GET /api/v1/demo/mimi,
steps[4] and steps[5]) and end on the plan with "16:05 taxi → 16:30 vet" and the claim checklist.

No keys: Gemini Live is FakeLive, provider endpoints are mocked with page.route; /api/v1/demo/mimi is the real server.
Screenshots land in test-results/story/.
"""
from pathlib import Path

from playwright.sync_api import Page, expect

from test_browser_steps import reach_plan

SHOTS = Path(__file__).resolve().parents[2] / "test-results" / "story"
CALL = 60_000  # a scripted call plays every German line with the browser voice


def shot(page: Page, name: str):
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=SHOTS / f"{name}.png", full_page=True)


def finish_call(page: Page, beat: str = "next"):
    button = page.locator(f"[data-beat={beat}]")
    expect(button).to_be_visible(timeout=CALL)
    return button


def test_live_story_plays_options_confirm_and_taxi(page: Page):
    page.set_viewport_size({"width": 390, "height": 844})
    reach_plan(page)
    page.get_by_role("button", name="Done", exact=True).click()
    page.locator(".action-row button.btn.primary").click()
    page.get_by_role("button", name="Prepare conversation").click()
    page.locator("details.handoff-more summary").click()
    page.get_by_role("button", name="Open simulated Mimi phone rehearsal").click()

    # Vet call (steps[2]) with the demo calendar, then straight on to the insurer (rehearsal stays on).
    expect(page.locator("[data-beat=calendar]")).to_contain_text("Free from 16:00", timeout=CALL)
    expect(page.locator("[data-beat=calendar]")).to_contain_text("demo")
    shot(page, "1-vet-calendar")
    nxt = finish_call(page)
    expect(nxt).to_have_text("Next: call the insurer")
    nxt.click()
    nxt = finish_call(page)
    expect(nxt).to_have_text("Next: see your options")
    nxt.click()

    # Option cards from the backend costs.
    options = page.locator("[data-beat=options]")
    expect(options.locator("[data-beat=option-clinic]")).to_contain_text("CHF 385")
    expect(options.locator("[data-beat=option-home]")).to_contain_text("CHF 510")
    expect(page.locator("[data-beat=confirm-call]")).to_have_count(0)  # tap to choose first
    page.locator("[data-beat=option-clinic]").click()
    expect(page.locator("[data-beat=option-clinic]")).to_have_attribute("aria-checked", "true")
    shot(page, "2-options")
    page.get_by_role("button", name="Call the vet to confirm 16:30").click()

    # Confirmation call (steps[4]): the story's German line, a simulated reply.
    nxt = finish_call(page)
    expect(page.locator("[data-beat=confirm-result]")).to_contain_text("simulated")
    page.locator("details.transcript summary").click()
    expect(page.locator(".line-original").filter(has_text="detaillierte Rechnung")).to_have_count(1)
    shot(page, "3-confirm")
    expect(nxt).to_have_text("Next: call a taxi")
    nxt.click()

    # Taxi call (steps[5]), not insured.
    nxt = finish_call(page)
    expect(page.locator("[data-beat=taxi-result]")).to_contain_text("16:05")
    expect(page.locator("[data-beat=taxi-result]")).to_contain_text("Not insured")
    shot(page, "4-taxi")
    expect(page.locator("[data-beat=back]")).to_have_count(0)  # one way on: the plan
    nxt.click()

    expect(page.locator("[data-beat=today]")).to_contain_text("16:05 taxi")
    expect(page.locator("[data-beat=today]")).to_contain_text("16:30 vet")
    expect(page.locator("[data-beat=today]")).to_contain_text("simulated")
    checklist = page.locator("[data-beat=checklist]")
    for item in ("video", "itemised invoice", "within 30 days"):
        expect(checklist).to_contain_text(item)
    expect(page.locator(".step-rail li[aria-current=step]")).to_contain_text("Summary")
    expect(page.locator("main")).not_to_contain_text("booked")
    shot(page, "5-plan")
