import os
import time
from automation.config.config import Config

class ScreenshotUtil:
    @staticmethod
    def capture_screenshot(driver, test_id):
        if not driver:
            return None
        try:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"{test_id}_{timestamp}.png"
            filepath = os.path.join(Config.SCREENSHOTS_DIR, filename)
            driver.save_screenshot(filepath)
            return filepath
        except Exception as e:
            print(f"Failed to capture screenshot for {test_id}: {e}")
            return None
