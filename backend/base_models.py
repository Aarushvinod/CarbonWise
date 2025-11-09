from pydantic import BaseModel, HttpUrl
from typing import Optional

class PageIn(BaseModel):
    url: HttpUrl
    userID: str

class SummaryOut(BaseModel):
    summary: str

# TODO: Add prompt optimization models
# class PromptOptimizationRequest(BaseModel):
#     prompt: str
#     url: HttpUrl
#     html: str
#
# class PromptOptimizationResponse(BaseModel):
#     optimized_prompt: str
#     original_token_count: Optional[int] = None
#     optimized_token_count: Optional[int] = None
#     token_reduction: Optional[float] = None