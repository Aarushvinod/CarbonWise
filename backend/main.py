import sys
import asyncio
import uvicorn
from app import app  # Import the FastAPI app object

# Set Proactor policy before Uvicorn spawns workers
if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)