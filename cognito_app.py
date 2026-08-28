import os
import sys
import webbrowser
import time
import threading
import uvicorn

def launch_browser():
    # Wait 1.2 seconds for the server to spin up fully
    time.sleep(1.2)
    url = "http://127.0.0.1:8000"
    print(f"\n[Cognito Launcher] Opening default web browser to: {url}")
    webbrowser.open(url)

if __name__ == "__main__":
    print("=" * 60)
    print("      COGNITO - OFFLINE AI DOCUMENT SEARCH & CLUSTERING")
    print("=" * 60)
    print("[Cognito Launcher] Initializing offline system layers...")
    print("[Cognito Launcher] Server running locally on: http://127.0.0.1:8000")
    print("[Cognito Launcher] 100% Secure & Private. No network connections will be made.")
    print("[Cognito Launcher] Press Ctrl+C to terminate the application.")
    print("-" * 60)

    # Start the browser launcher in a background thread
    threading.Thread(target=launch_browser, daemon=True).start()

    # Launch FastAPI using Uvicorn
    try:
        uvicorn.run(
            "backend.main:app",
            host="127.0.0.1",
            port=8000,
            log_level="info",
            reload=False
        )
    except KeyboardInterrupt:
        print("\n[Cognito Launcher] Cognito shutting down gracefully...")
    except Exception as e:
        print(f"\n[Cognito Launcher] Server failed to start: {e}")
