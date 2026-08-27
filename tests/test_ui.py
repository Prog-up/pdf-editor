import os
import time
from playwright.sync_api import sync_playwright

def test_pdf_editor():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        
        # Log any errors
        page.on("console", lambda msg: print(f"Browser Console: {msg.type} {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser Error: {err.message}"))
        
        print("Navigating to app...")
        page.goto('http://localhost:8000')
        page.wait_for_load_state('networkidle')
        
        print("Uploading dummy PDF...")
        file_input = page.locator('#file-upload')
        file_input.set_input_files('dummy.pdf')
        
        # Wait for canvas to render
        page.wait_for_selector('canvas#pdf-canvas', state='visible')
        page.wait_for_selector('.textLayer > span', state='visible')
        
        print("Selecting text...")
        # Get the first span in the text layer
        span = page.locator('.textLayer > span').first
        span_box = span.bounding_box()
        
        # Simulate selection (drag across the span)
        page.mouse.move(span_box['x'] + 2, span_box['y'] + 2)
        page.mouse.down()
        page.mouse.move(span_box['x'] + span_box['width'] - 2, span_box['y'] + span_box['height'] - 2)
        page.mouse.up()
        
        # Check if popup appears
        popup = page.locator('#edit-popup')
        popup.wait_for(state='visible', timeout=5000)
        print("Popup visible!")
        
        print("Editing text...")
        edit_input = page.locator('#edit-input')
        original_val = edit_input.input_value()
        
        # Replace text
        edit_input.fill('Testing')
        
        page.locator('#save-edit-btn').click()
        
        # Handle the alert ("Edit saved...")
        page.on("dialog", lambda dialog: dialog.accept())
        
        print("Downloading PDF...")
        with page.expect_download() as download_info:
            page.locator('#download-btn').click()
        download = download_info.value
        
        download_path = os.path.join(os.getcwd(), 'modified_document_test.pdf')
        download.save_as(download_path)
        print(f"Downloaded successfully to {download_path}")
        
        browser.close()

if __name__ == "__main__":
    test_pdf_editor()
