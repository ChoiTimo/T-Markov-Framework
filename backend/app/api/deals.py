"""Deal CRUD — Phase 1 Sprint 1-2."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_deals():
    """List all deals (paginated). → Sprint 1-2"""
    return {"message": "Not yet implemented", "sprint": "1-2"}
