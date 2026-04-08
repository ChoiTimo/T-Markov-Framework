"""SmartWAN Platform API — FastAPI Application Entry Point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api import health, customers, deals, quotes, battlecards, proposals

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routers
app.include_router(health.router, tags=["Health"])
app.include_router(customers.router, prefix="/api/customers", tags=["Customers"])
app.include_router(deals.router, prefix="/api/deals", tags=["Deals"])
app.include_router(quotes.router, prefix="/api/quotes", tags=["Quotes"])
app.include_router(battlecards.router, prefix="/api/battlecards", tags=["BattleCards"])
app.include_router(proposals.router, prefix="/api/proposals", tags=["Proposals"])
