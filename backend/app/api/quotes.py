"""Quote Calculator API — Phase 2 Sprint 2-1 (세일즈 코어 루프 #1)."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_quotes():
    """List quotes for a deal. → Sprint 2-1"""
    return {"message": "Not yet implemented", "sprint": "2-1"}
