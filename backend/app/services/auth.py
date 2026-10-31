from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.models.user import RefreshToken, User
from app.schemas.auth import TokenPair

# A pre-computed hash used to keep login timing similar for unknown emails.
_DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


class AuthError(Exception):
    pass


class EmailAlreadyRegistered(Exception):
    pass


def _normalise_email(email: str) -> str:
    return email.strip().lower()


async def register_user(db: AsyncSession, email: str, password: str, full_name: str | None) -> User:
    email = _normalise_email(email)
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise EmailAlreadyRegistered(email)
    user = User(email=email, password_hash=hash_password(password), full_name=full_name)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == _normalise_email(email)))
    if user is None:
        verify_password(password, _DUMMY_HASH)
        raise AuthError("invalid credentials")
    if not verify_password(password, user.password_hash) or not user.is_active:
        raise AuthError("invalid credentials")
    return user


async def issue_tokens(db: AsyncSession, user: User) -> TokenPair:
    settings = get_settings()
    access, expires_in = create_access_token(user.id, user.role.value)
    refresh = new_refresh_token()
    now = datetime.now(UTC)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh),
            created_at=now,
            expires_at=now + timedelta(days=settings.refresh_token_days),
        )
    )
    await db.commit()
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=expires_in)


async def rotate_refresh_token(db: AsyncSession, refresh_token: str) -> TokenPair:
    """Exchange a valid refresh token for a new pair; the old one is revoked.

    Re-use of an already revoked token revokes every token for that user
    (refresh-token theft detection).
    """
    now = datetime.now(UTC)
    record = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
    )
    if record is None:
        raise AuthError("invalid refresh token")
    if record.revoked_at is not None:
        await _revoke_all(db, record.user_id, now)
        await db.commit()
        raise AuthError("refresh token reuse detected")
    if record.expires_at <= now:
        raise AuthError("refresh token expired")
    user = await db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise AuthError("user inactive")
    record.revoked_at = now
    return await issue_tokens(db, user)


async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> None:
    record = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
    )
    if record is not None and record.revoked_at is None:
        record.revoked_at = datetime.now(UTC)
        await db.commit()


async def _revoke_all(db: AsyncSession, user_id, now: datetime) -> None:
    tokens = await db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    )
    for t in tokens:
        t.revoked_at = now
