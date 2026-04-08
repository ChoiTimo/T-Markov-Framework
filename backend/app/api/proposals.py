"""Proposal Generator API — Phase 2 Sprint 2-3~2-5 (세일즈 코어 루프 #3).

Absorbs tmarkov-app (tmarkov-app.vercel.app) logic:
- Module selection algorithm
- PPTX assembly
- Neuro-dogma mapping (CH06)
- Cover/TOC auto-generation
- Claude API module recommendation
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_proposals():
    """List proposals for a deal. → Sprint 2-3"""
    return {"message": "Not yet implemented", "sprint": "2-3"}


@router.post("/create")
async def create_proposal():
    """Create proposal from deal context (quote + battlecard data auto-injected). → Sprint 2-4"""
    return {"message": "Not yet implemented", "sprint": "2-4"}


@router.post("/recommend")
async def recommend_modules():
    """Claude API-powered module recommendation based on deal/customer context. → Sprint 2-5"""
    return {"message": "Not yet implemented", "sprint": "2-5"}


@router.get("/modules")
async def list_modules():
    """Module catalog (synced from Notion, cached in Supabase). → Sprint 2-3"""
    return {"message": "Not yet implemented", "sprint": "2-3"}
