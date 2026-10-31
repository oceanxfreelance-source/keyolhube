from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core.rate_limit import rate_limit
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenPair, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("register", limit=10, window_seconds=3600))],
)
async def register(body: RegisterRequest, db: DbSession):
    try:
        return await auth_service.register_user(db, body.email, body.password, body.full_name)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered") from None


@router.post(
    "/login",
    response_model=TokenPair,
    dependencies=[Depends(rate_limit("login", limit=20, window_seconds=300))],
)
async def login(body: LoginRequest, db: DbSession):
    try:
        user = await auth_service.authenticate(db, body.email, body.password)
    except auth_service.AuthError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password") from None
    return await auth_service.issue_tokens(db, user)


@router.post(
    "/refresh",
    response_model=TokenPair,
    dependencies=[Depends(rate_limit("refresh", limit=60, window_seconds=300))],
)
async def refresh(body: RefreshRequest, db: DbSession):
    try:
        return await auth_service.rotate_refresh_token(db, body.refresh_token)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from None


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: DbSession):
    await auth_service.revoke_refresh_token(db, body.refresh_token)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
