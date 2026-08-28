from selenium.webdriver.common.by import By
from automation.pages.base_page import BasePage

class AuthPage(BasePage):
    # Locators
    GATE_SCREEN = (By.ID, "auth-gate-screen")
    GATE_TITLE = (By.ID, "gate-auth-title")
    TAB_SIGNUP = (By.ID, "gate-tab-signup")
    TAB_LOGIN = (By.ID, "gate-tab-login")
    INPUT_DISPLAY_NAME = (By.ID, "gate-auth-display-name")
    INPUT_EMAIL = (By.ID, "gate-auth-email")
    INPUT_PASSWORD = (By.ID, "gate-auth-password")
    BTN_SUBMIT = (By.ID, "gate-auth-submit-btn")
    BTN_GOOGLE = (By.ID, "gate-google-auth-btn")
    BTN_GUEST = (By.ID, "gate-guest-auth-btn")
    ALERT_BOX = (By.ID, "gate-auth-alert")
    ALERT_MSG = (By.ID, "gate-auth-alert-msg")
    BTN_FORGOT_PWD = (By.ID, "gate-forgot-pwd-btn")
    
    # App Container
    APP_CONTAINER = (By.ID, "app-container")
    USER_DISPLAY_NAME = (By.ID, "user-display-name")
    USER_EMAIL_TEXT = (By.ID, "user-email-text")
    BTN_LOGOUT = (By.ID, "auth-logout-btn")

    def open_gate(self):
        self.navigate_to()
        return self.is_visible(self.GATE_SCREEN, timeout=5)

    def switch_to_signup(self):
        self.click(self.TAB_SIGNUP)

    def switch_to_login(self):
        self.click(self.TAB_LOGIN)

    def create_account(self, name, email, password):
        self.switch_to_signup()
        if name:
            self.type(self.INPUT_DISPLAY_NAME, name)
        self.type(self.INPUT_EMAIL, email)
        self.type(self.INPUT_PASSWORD, password)
        self.click(self.BTN_SUBMIT)

    def sign_in(self, email, password):
        self.switch_to_login()
        self.type(self.INPUT_EMAIL, email)
        self.type(self.INPUT_PASSWORD, password)
        self.click(self.BTN_SUBMIT)

    def sign_in_as_guest(self):
        self.click(self.BTN_GUEST)

    def is_logged_in(self):
        return self.is_visible(self.APP_CONTAINER, timeout=5)

    def get_alert_text(self):
        if self.is_visible(self.ALERT_BOX, timeout=3):
            return self.get_text(self.ALERT_MSG)
        return ""

    def logout(self):
        if self.is_visible(self.BTN_LOGOUT, timeout=3):
            self.click(self.BTN_LOGOUT)
