from __future__ import annotations

import json
import os
from typing import Any, Callable, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from base_models import PageIn, SummaryOut
import google.generativeai as genai
from crawl4ai import DefaultMarkdownGenerator, AsyncWebCrawler, CrawlerRunConfig
import datetime
from dotenv import load_dotenv
import dspy

from datetime import timezone
from firebase_admin import firestore, credentials, auth
from base_models import PromptOptimizationRequest, PromptOptimizationResponse

import helpers
import firebase_admin


dspy.settings.configure(lm = dspy.LM("gemini/gemini-2.5-flash-lite", api_key=os.getenv("GOOGLE_API_KEY"), max_tokens=1500, temperature=0.3))
load_dotenv()
app = FastAPI(title="Carbon Emissions Pipeline API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          
    allow_credentials=True,
    allow_methods=["*"],            # GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],            # e.g. Authorization, Content-Type
)

cred = credentials.Certificate('service-account.json')
firebase_admin.initialize_app(cred)
db = firestore.Client.from_service_account_json('service-account.json')

FUNCTION_REGISTRY: Dict[str, Callable[..., Any]] = {
    "get_flight_emissions": helpers.get_flight_emissions,
    "shopping_predict_carbon_footprint": helpers.shopping_predict_carbon_footprint
}

async def html_to_markdown_with_crawl4ai(url: str) -> str:
    cg = DefaultMarkdownGenerator(
        content_source="cleaned_html",
        options={"ignore_links": True}
    )
    config = CrawlerRunConfig(markdown_generator=cg)
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url, config=config)
        if result.success:
            print('success!')
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
        "- Use best guesses for function parameters. No predictions should yield 0 kg CO2e\n" 
        "- Do not include these guess parameters in the summary.\n"
        "- After the tool output is returned, produce a concise end-user summary (1 sentence)."
    )

    config = genai.GenerationConfig(
        temperature = 1
    )
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        tools=tools,
        system_instruction=system_message,
        generation_config=config
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
    print(tool_result, "tr")
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

def firestore_iso_z(value=None):
    # Return current time string
    if value is None:
        now = datetime.now(timezone.utc)
        ms = now.microsecond // 1000
        return now.strftime(f"%Y-%m-%dT%H:%M:%S.{ms:03d}Z")

    # If a datetime is passed -> return ISO string with milliseconds and Z (UTC)
    if isinstance(value, datetime):
        dt = value
        # If naive, assume UTC (change this if you want different default behavior)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # convert to UTC
        dt_utc = dt.astimezone(timezone.utc)
        ms = dt_utc.microsecond // 1000
        return dt_utc.strftime(f"%Y-%m-%dT%H:%M:%S.{ms:03d}Z")

    # If a string is passed -> parse into aware datetime (UTC)
    if isinstance(value, str):
        s = value.strip()
        # If it ends with 'Z', replace with +00:00 which fromisoformat understands
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        # datetime.fromisoformat can parse variable fractional seconds and offsets
        dt = datetime.fromisoformat(s)
        # ensure timezone-aware UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    raise TypeError("value must be None, datetime.datetime, or str")

@app.post("/optimize_prompt", response_model=PromptOptimizationResponse)
def optimize_prompt(payload: PromptOptimizationRequest):
    optimizer = dspy.load("optimizer_compiled")
    pred = optimizer(original=payload.prompt)
    return PromptOptimizationResponse(optimized_prompt=pred.optimized.strip())

@app.post("/process_page", response_model=SummaryOut)
async def process_page(payload: PageIn, authorization: Optional[str] = Header(default=None)):
    """
    Pipeline:
      1. Convert HTML → Markdown (Crawl4AI).
      2. Load Gemini tools.
      3. Ask Gemini which function to call.
      4. If a function is called, execute via registry.
      5. Return Gemini’s ≤50-word summary.
    """
    markdown = await html_to_markdown_with_crawl4ai(str(payload.url))
    print(markdown + "MARKDOWN")
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
        print(fn_name, "fn")
        tool_result = fn(tool_args)
        summary = summarize_with_gemini(chat, tool_used, tool_args, tool_result)
        print(summary)
        doc_ref = db.collection('users').document(payload.userID)
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            data['actions'][summary] = tool_result
            data['actionTimestamps'][summary] = firestore_iso_z()
            doc_ref.set(data)
        else:
            user = auth.get_user(payload.userID)
            doc_ref.set({
                "actionTimestamps" : {summary: firestore_iso_z()},
                "actions" : {summary: tool_result},
                "createdAt" : firestore_iso_z(),
                "email" : user.email,
                "mostRecentInsightsTimestamp" : None,
                "previousAdvice" : {}

            })

    else:
        summary = summarize_with_gemini(chat, None, None, None)
    return SummaryOut(
        summary=summary,
    )