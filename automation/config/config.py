import os

class Config:
    # Live Deployment Target (Default points to GitHub Pages repository deployment)
    BASE_URL = os.environ.get("BASE_URL", "https://kvarshan.github.io/Cognito_App/")
    
    # Timeouts
    DEFAULT_TIMEOUT = int(os.environ.get("DEFAULT_TIMEOUT", 15))
    IMPLICIT_WAIT = int(os.environ.get("IMPLICIT_WAIT", 10))
    PAGE_LOAD_TIMEOUT = int(os.environ.get("PAGE_LOAD_TIMEOUT", 30))
    
    # Headless & Execution Settings
    HEADLESS = os.environ.get("HEADLESS", "true").lower() in ("true", "1", "yes")
    BROWSER = os.environ.get("BROWSER", "chrome").lower()
    
    # Paths
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    REPORTS_DIR = os.path.join(BASE_DIR, "reports")
    SCREENSHOTS_DIR = os.path.join(BASE_DIR, "screenshots")
    LOGS_DIR = os.path.join(BASE_DIR, "logs")
    DATA_DIR = os.path.join(BASE_DIR, "data")
    
    # Ensure directories exist
    for directory in [REPORTS_DIR, SCREENSHOTS_DIR, LOGS_DIR, DATA_DIR]:
        os.makedirs(directory, exist_ok=True)
