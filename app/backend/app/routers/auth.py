import os
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth.oauth import get_flow
from app.db.database import get_db
from app.db.models import User

router = APIRouter()


@router.get("/login")
def login():
    flow = get_flow()
    auth_url, _ = flow.authorization_url(prompt="select_account")
    return RedirectResponse(auth_url)


@router.get("/callback")
def callback(code: str, state: str | None = None, db: Session = Depends(get_db)):
    flow = get_flow()
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {e}")

    creds = flow.credentials

    import google.oauth2.id_token
    import google.auth.transport.requests

    request = google.auth.transport.requests.Request()
    id_info = google.oauth2.id_token.verify_oauth2_token(
        creds.id_token, request, clock_skew_in_seconds=10
    )

    user_id = id_info["sub"]
    email = id_info.get("email", "")
    name = id_info.get("name", "")

    # Upsert user into DB
    user = db.get(User, user_id)
    if user:
        user.email = email
        user.name = name
    else:
        user = User(id=user_id, email=email, name=name)
        db.add(user)
    db.commit()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return RedirectResponse(f"{frontend_url}?user_id={user_id}&email={email}&name={name}")


@router.get("/logout")
def logout():
    return {"status": "logged out"}
