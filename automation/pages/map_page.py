from selenium.webdriver.common.by import By
from automation.pages.base_page import BasePage

class MapPage(BasePage):
    NAV_MAP = (By.ID, "nav-map")
    MAP_CONTAINER = (By.ID, "map-view")
    MAP_CANVAS = (By.ID, "document-map-canvas")
    BTN_RECENTER = (By.ID, "map-reset-btn")
    CLUSTER_LEGEND = (By.ID, "clusters-legend-list")
    TOOLTIP = (By.ID, "map-node-tooltip")

    def open_map(self):
        self.click(self.NAV_MAP)

    def is_canvas_displayed(self):
        return self.is_visible(self.MAP_CANVAS)

    def click_recenter(self):
        self.click(self.BTN_RECENTER)
