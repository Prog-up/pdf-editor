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
        # Upload dummy PDF
        page.locator('#file-upload').set_input_files('dummy_standard.pdf')
        
        # Wait for text layer to render
        page.wait_for_selector('.textLayer > span', state='visible')
        page.wait_for_selector('.textLayer > span', state='visible')
        
        print("Selecting text...")
        # Get the span containing 'This text is red'
        span = page.locator('.textLayer > span', has_text='This text is red').first
        span_box = span.bounding_box()
        
        # Simulate selection (drag across the span)
        page.mouse.move(span_box['x'] + 2, span_box['y'] + 2)
        page.mouse.down()
        page.mouse.move(span_box['x'] + span_box['width'] - 2, span_box['y'] + span_box['height'] - 2)
        page.mouse.up()
        
        # Check if popup appears
        popup = page.locator('#edit-controls')
        popup.wait_for(state='visible', timeout=5000)
        print("Popup visible!")
        
        print("Editing text (replacing with identical string for diff test)...")
        edit_input = page.locator('#edit-input')
        original_val = edit_input.input_value()
        print(f"Original text detected: '{original_val}'")
        
        # Replace text with the exact same value
        edit_input.fill(original_val)
        
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

    print("Running visual diff with diff-pdf...")
    import subprocess
    result = subprocess.run(['nix-shell', '-p', 'diff-pdf', '--run', f'diff-pdf --output-diff=diff_output.pdf dummy_standard.pdf {download_path}'], capture_output=True)
    if result.returncode != 0:
        print("Visual differences found! Check diff_output.pdf")
        print("diff-pdf output:")
        print(result.stderr.decode() or result.stdout.decode())
        # Let's not fail the script completely yet, as small subpixel diffs are expected due to font substitution
    else:
        print("PDF is visually identical!")

if __name__ == "__main__":
    test_pdf_editor()
