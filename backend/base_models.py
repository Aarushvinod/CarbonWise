from pydantic import BaseModel, HttpUrl
class PageIn(BaseModel):
    url: HttpUrl
    userID: str

class SummaryOut(BaseModel):
    summary: str

class PromptOptimizationRequest(BaseModel):
    prompt: str

class PromptOptimizationResponse(BaseModel):
    optimized_prompt: str