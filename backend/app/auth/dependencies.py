"""FastAPI dependencies for Supabase JWT auth & RBAC."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

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
# JWT verification
# ------------------------------------------------------------------

async def get_current_user(
    authorization: str = Header(..., alias="Authorization"),
) -> CurrentUser:
    """Extract & verify Supabase JWT from Authorization header.

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
        # Supabase JWT secret = project JWT secret (Settings > API > JWT Secret)
        # For anon/service_role JWTs, the secret is the SUPABASE_JWT_SECRET env var.
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
