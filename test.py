from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Listen to console logs
    page.on("console", lambda msg: print(f"Console {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Page Error: {err.message}"))
    
    page.goto('http://localhost:8000')
    page.wait_for_load_state('networkidle')
    
    print("Page loaded")
    
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
