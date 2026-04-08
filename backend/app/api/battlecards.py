"""BattleCard API — Phase 2 Sprint 2-2 (세일즈 코어 루프 #2)."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_battlecards():
    """List all battle cards. → Sprint 2-2"""
    return {"message": "Not yet implemented", "sprint": "2-2"}
