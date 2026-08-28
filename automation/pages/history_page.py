from selenium.webdriver.common.by import By
from automation.pages.base_page import BasePage

class HistoryPage(BasePage):
    NAV_HISTORY = (By.ID, "nav-history")
    HISTORY_CONTAINER = (By.ID, "history-view")
    HISTORY_LIST = (By.ID, "history-list")
    BTN_CLEAR_HISTORY = (By.ID, "clear-history-btn")

    def open_history(self):
        self.click(self.NAV_HISTORY)

    def clear_history(self):
        self.click(self.BTN_CLEAR_HISTORY)
