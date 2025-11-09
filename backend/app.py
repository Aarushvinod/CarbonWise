from __future__ import annotations

import json
import os
from typing import Any, Callable, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from base_models import PageIn, SummaryOut

import google.generativeai as genai
from crawl4ai import DefaultMarkdownGenerator, AsyncWebCrawler, CrawlerRunConfig
import asyncio
from dotenv import load_dotenv

import helpers

load_dotenv()
app = FastAPI(title="Carbon Emissions Pipeline API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          
    allow_credentials=True,
    allow_methods=["*"],            # GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],            # e.g. Authorization, Content-Type
)

def get_flight_emissions() -> float:
    """Dummy placeholder; will compute ICAO-based emissions later."""
    return 123.456



FUNCTION_REGISTRY: Dict[str, Callable[..., Any]] = {
    "get_flight_emissions": get_flight_emissions,
    "shopping_predict_carbon_footprint": helpers.shopping_predict_carbon_footprint
}


async def html_to_markdown_with_crawl4ai(url: str, html: str) -> str:
    cg = DefaultMarkdownGenerator(
        content_source="cleaned_html",
        options={"ignore_links": True}
    )
    config = CrawlerRunConfig(markdown_generator=cg)
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url, config=config)
        if result.success:
            return result.markdown


def load_function_tools(file_path: str = "function_tools.json") -> List[dict]:
    """Load Gemini tool/function declarations from function_tools.json."""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    tools = data.get("tools", [])
    if not isinstance(tools, list):
        raise ValueError("`function_tools` must be a list in function_tools.json")
    return tools


def init_gemini(tools: List[dict]):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY env var not set.")
    genai.configure(api_key=api_key)

    system_message = (
        "You are a function-routing planner for a carbon emissions assistant.\n"
        "- Read the provided Markdown (converted from the user's HTML) and the page URL.\n"
        "- Decide whether any available function should be called.\n"
        "- If no function applies, take no action (same as 'no action taken').\n"
        "- If a function applies, call it with concise, well-formed arguments.\n"
        "- After the tool output is returned, produce a concise end-user summary (1 sentence)."
    )

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        tools=tools,
        system_instruction=system_message,
    )
    return model.start_chat()


def extract_function_call_from_gemini(response) -> Optional[dict]:
    """Extract function call structure from Gemini response if present."""
    for cand in response.candidates or []:
        for part in cand.content.parts or []:
            if hasattr(part, "function_call") and part.function_call:
                fc = part.function_call
                args = getattr(fc, "args", {}) or {}
                if isinstance(args, str):
                    args = json.loads(args)
                return {"name": fc.name, "args": args}
    return None


def summarize_with_gemini(chat, tool_name: Optional[str], tool_args: Optional[dict], tool_result: Any) -> str:
    """Ask Gemini for a ≤50-word user-facing summary given the tool result."""
    print(tool_result)
    if tool_name:
        msg = (
            "Tool call completed.\n"
            f"Tool: {tool_name}\n"
            f"Result: {json.dumps(tool_result, ensure_ascii=False)}\n\n"
            "Now produce a ≤50-word user-facing summary."
        )
    else:
        msg = (
            "No tool call was made (no action taken).\n"
            "Produce a ≤50-word summary saying that no action was required."
        )

    resp = chat.send_message(msg)
    return getattr(resp, "text", "No summary generated.")[:400]

@app.post("/process_page", response_model=SummaryOut)
async def process_page(payload: PageIn):
    """
    Pipeline:
      1. Convert HTML → Markdown (Crawl4AI).
      2. Load Gemini tools.
      3. Ask Gemini which function to call.
      4. If a function is called, execute via registry.
      5. Return Gemini’s ≤50-word summary.
    """
    markdown = await html_to_markdown_with_crawl4ai(str(payload.url), payload.html)
    tools = load_function_tools("function_tools.json")
    chat = init_gemini(tools)

    # Step 1: Ask Gemini to decide which function (if any) to call
    prompt = (
        "Here is the page context.\n\n"
        f"URL: {payload.url}\n\nMarkdown:\n{markdown}\n\n"
        "Decide whether to call a function. If none applies, do nothing."
    )
    response = chat.send_message(prompt)

    # Step 2: Parse function call
    fn_call = extract_function_call_from_gemini(response)
    tool_used, tool_args, tool_result = None, None, None

    if fn_call and fn_call.get("name"):
        fn_name = fn_call["name"]
        tool_used = fn_name
        tool_args = fn_call.get("args", {}) or {}

        if fn_name not in FUNCTION_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Tool '{fn_name}' not found.")

        fn = FUNCTION_REGISTRY[fn_name]
        print(fn_name)
        tool_result = fn(tool_args)
        summary = summarize_with_gemini(chat, tool_used, tool_args, tool_result)
    else:
        summary = summarize_with_gemini(chat, None, None, None)
    print(summary)
    return SummaryOut(
        summary=summary,
    )