from fastapi import APIRouter

from app.api.v1 import auth, interests, papers, swipes

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(interests.router)
api_router.include_router(papers.router)
api_router.include_router(swipes.router)
