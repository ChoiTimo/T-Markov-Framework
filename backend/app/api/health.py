"""Health check endpoint — Sprint 0-1 verification gate."""

from fastapi import APIRouter
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health_check():
    """Health check for Railway deployment verification."""
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
    }


@router.get("/")
async def root():
    """Root endpoint redirects to health."""
    return {
        "message": f"{settings.app_name} v{settings.app_version}",
        "docs": "/docs" if settings.debug else "disabled in production",
    }
