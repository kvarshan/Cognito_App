from selenium.webdriver.common.by import By
from automation.pages.base_page import BasePage

class DashboardPage(BasePage):
    # Navigation Tabs
    NAV_DASHBOARD = (By.ID, "nav-dashboard")
    NAV_MAP = (By.ID, "nav-map")
    NAV_SEARCH = (By.ID, "nav-search")
    NAV_HISTORY = (By.ID, "nav-history")
    
    # Dashboard Controls
    INPUT_DIR_PATH = (By.ID, "directory-path-input")
    BTN_SCAN = (By.ID, "scan-btn")
    BTN_DEMO = (By.ID, "load-demo-btn")
    BTN_TRAIN = (By.ID, "train-btn")
    
    # Stats Counters
    STAT_TOTAL_DOCS = (By.ID, "stat-total-docs")
    STAT_TOTAL_SIZE = (By.ID, "stat-total-size")
    STAT_CLUSTERS = (By.ID, "stat-clusters")
    
    # File Breakdown & Terminal
    BREAKDOWN_LIST = (By.ID, "breakdown-list")
    TERMINAL_LOGS = (By.ID, "terminal-logs")
    APP_STATUS_BADGE = (By.ID, "app-status-badge")

    def scan_directory(self, path):
        self.type(self.INPUT_DIR_PATH, path)
        self.click(self.BTN_SCAN)

    def load_demo_data(self):
        self.click(self.BTN_DEMO)

    def train_model(self):
        self.click(self.BTN_TRAIN)

    def get_total_documents_count(self):
        return self.get_text(self.STAT_TOTAL_DOCS)

    def get_total_size_text(self):
        return self.get_text(self.STAT_TOTAL_SIZE)

    def get_clusters_count(self):
        return self.get_text(self.STAT_CLUSTERS)

    def get_terminal_logs_text(self):
        return self.get_text(self.TERMINAL_LOGS)
