from selenium.webdriver.common.by import By
from automation.pages.base_page import BasePage

class SearchPage(BasePage):
    NAV_SEARCH = (By.ID, "nav-search")
    SEARCH_INPUT = (By.ID, "search-query-input")
    BTN_SEARCH = (By.ID, "execute-search-btn")
    SELECT_CLUSTER = (By.ID, "search-cluster-filter")
    SELECT_FILETYPE = (By.ID, "search-type-filter")
    SEARCH_RESULTS_GRID = (By.ID, "search-results-grid")
    QA_BOX = (By.ID, "qa-answer-card")
    QA_ANSWER_TEXT = (By.ID, "qa-answer-text")

    def open_search(self):
        self.click(self.NAV_SEARCH)

    def execute_search(self, query):
        self.type(self.SEARCH_INPUT, query)
        self.click(self.BTN_SEARCH)

    def is_qa_answer_visible(self):
        return self.is_visible(self.QA_BOX, timeout=5)
