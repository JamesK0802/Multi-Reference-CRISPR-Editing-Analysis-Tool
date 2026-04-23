import uvicorn
import os
import sys

# Ensure the current directory is in the path so api.py can be found
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from api import app

if __name__ == "__main__":
    # Start the FastAPI server using uvicorn
    # log_level="info" ensures we see startup logs in Electron
    uvicorn.run("api:app", host="127.0.0.1", port=8000, log_level="info", reload=False)
