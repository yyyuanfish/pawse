"""Simple accounts and the owner's history: guest by default, username + password to keep it across devices."""
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import Field

from . import store
from .models import Model

router = APIRouter(prefix="/api/v1", tags=["Accounts and history"])
COOKIE = "pawse_user"
YEAR = 365 * 24 * 3600


class Credentials(Model):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=6, max_length=200, repr=False)


class Me(Model):
    signed_in: bool
    username: str | None = None


class HistoryEntry(Model):
    kind: Literal["assessment"]
    title: str = Field(min_length=1, max_length=200)
    detail: dict[str, Any] = Field(default_factory=dict)


def set_cookie(request: Request, response: Response, token: str):
    response.set_cookie(COOKIE, token, httponly=True, samesite="strict", max_age=YEAR, secure=request.url.scheme == "https")


def current_user(request: Request, response: Response | None = None):
    """The signed-in or guest user; creates a guest (and its cookie) when a response is given."""
    user = store.user_for(request.cookies.get(COOKIE))
    if user or response is None:
        return user
    user, token = store.new_guest()
    set_cookie(request, response, token)
    return user


@router.get("/me", response_model=Me)
async def me(request: Request, response: Response):
    name = store.username(current_user(request, response))
    return Me(signed_in=bool(name), username=name)


@router.post("/auth/register", response_model=Me, status_code=201)
async def register(payload: Credentials, request: Request, response: Response):
    user = current_user(request, response)
    if not store.register(user, payload.username, payload.password):
        raise HTTPException(409, "That username is taken, or you are already signed in.")
    return Me(signed_in=True, username=payload.username)


@router.post("/auth/login", response_model=Me)
async def login(payload: Credentials, request: Request, response: Response):
    account = store.login(payload.username, payload.password, guest_id=current_user(request))
    if not account:
        raise HTTPException(401, "Wrong username or password.")
    set_cookie(request, response, store.new_token(account))
    return Me(signed_in=True, username=payload.username)


@router.post("/auth/logout", response_model=Me)
async def logout(request: Request, response: Response):
    store.logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE)
    return Me(signed_in=False)


@router.get("/history")
async def get_history(request: Request, response: Response):
    return {"items": store.history(current_user(request, response))}


@router.post("/history", status_code=201)
async def add_history(entry: HistoryEntry, request: Request, response: Response):
    store.add(current_user(request, response), entry.kind, entry.title, entry.detail)
    return {"ok": True}
