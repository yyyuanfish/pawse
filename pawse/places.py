"""Nearby taxis and the owner's insurer contact, shown live next to the clinic list.

Google Places is used when GOOGLE_PLACES_API_KEY is configured; otherwise Gemini's Grounding with
Google Maps. Results are displayed to the requesting owner only, never stored, and never booked.
"""
import os
import re
from typing import Literal

import httpx
from fastapi import APIRouter
from pydantic import Field

from .models import Location, Model, phone_uri
from .providers import ProviderError, maps_grounding, now, safe_url

router = APIRouter(prefix="/api/v1/places", tags=["Places"])
PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_FIELDS = ("places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,"
                 "places.googleMapsUri,places.websiteUri,places.rating")
TAXI_WORDS = ("taxi", "cab ")
DEMO_INSURER_WORDS = ("pawse demo", "fictional")


class Place(Model):
    id: str
    name: str
    address: str = ""
    phone: str | None = None
    call_url: str | None = None
    website: str | None = None
    maps_url: str | None = None
    rating: float | None = None
    opening_hours: list[str] = Field(default_factory=list, max_length=14)
    source: Literal["google_places", "gemini_maps"]
    retrieved_at: str


class NearbyRequest(Model):
    kind: Literal["taxi"] = "taxi"
    location: Location
    radius_km: float = Field(default=5, ge=0.5, le=30)
    share_location: Literal[True]


class InsurerRequest(Model):
    company: str = Field(min_length=1, max_length=100)
    location: Location | None = None
    share_location: bool = False


class PlacesResult(Model):
    kind: Literal["taxi", "insurer"]
    status: Literal["complete", "unavailable"]
    places: list[Place]
    warnings: list[str]
    note: str


async def places_text(client, query, location, radius_km, keep):
    key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not key:
        raise ProviderError("google_places_not_configured")
    body = {"textQuery": query, "maxResultCount": 10}
    if location:
        body["locationBias"] = {"circle": {"center": {"latitude": location.lat, "longitude": location.lng},
                                           "radius": min(radius_km, 50) * 1000}}
    r = await client.post(PLACES_TEXT_URL, headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACES_FIELDS}, json=body, timeout=15)
    r.raise_for_status()
    result = []
    for p in r.json().get("places", []):
        name = p.get("displayName", {}).get("text", "")
        if not name or not keep(name.lower() + " "):
            continue
        phone = p.get("internationalPhoneNumber")
        result.append(Place(id="places:" + str(p["id"]), name=name, address=p.get("formattedAddress", ""),
                            phone=phone if phone_uri(phone) else None, call_url=phone_uri(phone),
                            website=safe_url(p.get("websiteUri")), maps_url=safe_url(p.get("googleMapsUri")),
                            rating=p.get("rating"), source="google_places", retrieved_at=now()))
    return result


async def lookup(query, prompt, location, radius_km, keep):
    """Places first when configured, then Maps grounding. Returns (places, warnings)."""
    warnings = []
    async with httpx.AsyncClient(follow_redirects=False) as client:
        if os.getenv("GOOGLE_PLACES_API_KEY"):
            try:
                places = await places_text(client, query, location, radius_km, keep)
                if places:
                    return places, warnings
            except (ProviderError, httpx.HTTPError, ValueError, KeyError, TypeError):
                warnings.append("google_places_unavailable")
        try:
            listings = await maps_grounding(client, [prompt], location, keep)
            return [Place(**{k: v for k, v in l.items() if k in Place.model_fields}) for l in listings], warnings
        except ProviderError as exc:
            warnings.append(str(exc))
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            warnings.append("gemini_maps_unavailable")
    return [], warnings


def is_taxi(text):
    return any(word in text for word in TAXI_WORDS)


@router.post("/nearby", response_model=PlacesResult)
async def nearby(req: NearbyRequest):
    # Only coordinates and a generic query leave the server.
    places, warnings = await lookup("taxi", f"Use Google Maps to find taxi companies and taxi stands within {req.radius_km:g} km "
                                    "of the given location. List up to 10 distinct places, nearest first, names only.",
                                    req.location, req.radius_km, is_taxi)
    return PlacesResult(kind="taxi", status="complete" if places or not warnings else "unavailable", places=places[:10],
                        warnings=warnings, note="Listed taxi services. Pawse has not booked a ride: call to confirm a cat in a "
                        "carrier is accepted, the fare and the pickup time.")


def insurer_word(company):
    words = [w for w in re.findall(r"\w+", company.casefold()) if len(w) >= 3]
    return words[0] if words else company.casefold().strip()


@router.post("/insurer", response_model=PlacesResult)
async def insurer(req: InsurerRequest):
    company = " ".join(re.findall(r"[\w&.'-]+", req.company))[:100]
    if any(w in company.casefold() for w in DEMO_INSURER_WORDS) or not company:
        return PlacesResult(kind="insurer", status="complete", places=[], warnings=[],
                            note="The demo insurer is fictional and has no office. Use the contact on your own policy.")
    word = insurer_word(company)
    location = req.location if req.share_location else None
    places, warnings = await lookup(f"{company} insurance", f"Use Google Maps to find offices or customer service locations of the "
                                    f"insurance company {company} in Switzerland. List up to 5 places, names only.",
                                    location, 50, lambda text: word in text)
    return PlacesResult(kind="insurer", status="complete" if places or not warnings else "unavailable", places=places[:5],
                        warnings=warnings, note="Public listings for the insurer you named, not your policy. For claims, use the "
                        "contact on your policy documents; coverage is only confirmed by the insurer.")
