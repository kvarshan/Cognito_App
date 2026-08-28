from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException
from automation.config.config import Config
from automation.utils.logger import get_logger

logger = get_logger("BasePage")

class BasePage:
    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, Config.DEFAULT_TIMEOUT)

    def navigate_to(self, url=None):
        target_url = url or Config.BASE_URL
        logger.info(f"Navigating to: {target_url}")
        self.driver.get(target_url)

    def find(self, locator, timeout=None):
        wait = WebDriverWait(self.driver, timeout) if timeout else self.wait
        return wait.until(EC.presence_of_element_located(locator))

    def find_visible(self, locator, timeout=None):
        wait = WebDriverWait(self.driver, timeout) if timeout else self.wait
        return wait.until(EC.visibility_of_element_located(locator))

    def find_all(self, locator, timeout=None):
        wait = WebDriverWait(self.driver, timeout) if timeout else self.wait
        try:
            wait.until(EC.presence_of_element_located(locator))
            return self.driver.find_elements(*locator)
        except TimeoutException:
            return []

    def click(self, locator, timeout=None):
        wait = WebDriverWait(self.driver, timeout) if timeout else self.wait
        elem = wait.until(EC.element_to_be_clickable(locator))
        elem.click()

    def type(self, locator, text, clear_first=True, timeout=None):
        elem = self.find_visible(locator, timeout)
        if clear_first:
            elem.clear()
        elem.send_keys(text)

    def get_text(self, locator, timeout=None):
        elem = self.find(locator, timeout)
        return elem.text

    def is_visible(self, locator, timeout=3):
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.visibility_of_element_located(locator)
            ).is_displayed()
        except (TimeoutException, NoSuchElementException, StaleElementReferenceException):
            return False

    def is_present(self, locator, timeout=3):
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located(locator)
            ) is not None
        except (TimeoutException, NoSuchElementException, StaleElementReferenceException):
            return False

    def execute_script(self, script, *args):
        return self.driver.execute_script(script, *args)
