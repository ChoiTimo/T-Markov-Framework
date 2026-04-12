"""FastAPI dependencies for Supabase JWT auth & RBAC."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Sequence

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from app.config import get_settings
from app.db import get_supabase_admin


# ------------------------------------------------------------------
# Data classes
# ------------------------------------------------------------------

@dataclass
class CurrentUser:
    """Decoded JWT payload for the current request."""
    id: str                # auth.users.id (UUID as string)
    email: str
    role: str = "authenticated"   # Supabase default role
    raw: dict = field(default_factory=dict)


# ------------------------------------------------------------------
# JWKS cache for ES256 verification
# ------------------------------------------------------------------

_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}
_JWKS_TTL = 3600  # re-fetch every 1 hour


def _get_jwks() -> list[dict]:
    """Fetch and cache Supabase JWKS (public keys for ES256)."""
    now = time.time()
    if _jwks_cache["keys"] and (now - _jwks_cache["fetched_at"]) < _JWKS_TTL:
        return _jwks_cache["keys"]

    settings = get_settings()
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return keys


def _find_jwk(kid: str) -> dict:
    """Find a JWK by key ID from cached JWKS."""
    keys = _get_jwks()
    for key in keys:
        if key.get("kid") == kid:
            return key
    raise ValueError(f"JWK with kid={kid} not found in JWKS")


# ------------------------------------------------------------------
# JWT verification
# ------------------------------------------------------------------

async def get_current_user(
    authorization: str = Header(..., alias="Authorization"),
) -> CurrentUser:
    """Extract & verify Supabase JWT from Authorization header.

    Supports both ES256 (JWKS-based) and legacy HS256 (secret-based).
    Expects: `Bearer <token>`
    """
    settings = get_settings()

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
        )

    token = authorization[7:]

    try:
        # Read unverified header to determine algorithm
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "ES256":
            # Modern Supabase: verify with JWKS public key
            kid = header.get("kid", "")
            key = _find_jwk(kid)
            payload = jwt.decode(
                token,
                key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        else:
            # Legacy HS256: verify with JWT secret
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {e}",
        )

    return CurrentUser(
        id=payload.get("sub", ""),
        email=payload.get("email", ""),
        role=payload.get("role", "authenticated"),
        raw=payload,
    )


# ------------------------------------------------------------------
# RBAC: require specific org role(s)
# ------------------------------------------------------------------

def require_role(
    allowed_roles: Sequence[str],
    org_id_param: str = "org_id",
):
    """Return a FastAPI dependency that checks the user's org role.

    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(
            user: CurrentUser = Depends(require_role(["owner", "admin"])),
        ):
            ...
    """

    async def _checker(
        user: CurrentUser = Depends(get_current_user),
        org_id: str | None = None,
    ) -> CurrentUser:
        if not org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="org_id is required for role-based access",
            )

        # Query org_members via admin client (bypasses RLS)
        admin = get_supabase_admin()
        result = (
            admin.table("org_members")
            .select("role")
            .eq("organization_id", org_id)
            .eq("user_id", user.id)
            .maybe_single()
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this organization",
            )

        user_role = result.data["role"]
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(allowed_roles)}. You have: {user_role}",
            )

        return user

    return _checker
