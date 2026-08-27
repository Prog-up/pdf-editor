from playwright.sync_api import sync_playwright
import os
import subprocess
import time

def test_attestation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        page.on("console", lambda msg: print(f"Browser Console: {msg.type} {msg.text}"))
        page.on("dialog", lambda dialog: dialog.accept())
        
        print("Navigating to app...")
        page.goto('http://localhost:8000')
        page.wait_for_load_state('networkidle')
        
        print("Uploading Attestation PDF...")
        page.locator('#file-upload').set_input_files("Attestation de pension d'invalidité père.pdf")
        
        page.wait_for_selector('.textLayer > span', state='visible', timeout=10000)
        
        print("Finding '1 771,28'...")
        spans = page.locator('.textLayer > span').all()
        target_span = None
        for span in spans:
            if "1 771,28" in span.text_content():
                target_span = span
                break
        
        assert target_span is not None, "Could not find '1 771,28'"
        
        print("Double clicking text...")
        target_span.dblclick()
        
        page.wait_for_selector('#edit-overlay', state='visible')
        print("Replacing with identical text for diff-pdf test...")
        page.locator('#edit-input').fill("1 771,28")
        
        with page.expect_download() as download_info:
            page.keyboard.press('Enter')
            
        download = download_info.value
        download_path = os.path.join(os.getcwd(), 'modified_attestation.pdf')
        download.save_as(download_path)
        print(f"Downloaded successfully to {download_path}")
        
        browser.close()
        
    print("Running visual diff with diff-pdf...")
    cmd = ['nix-shell', '-p', 'diff-pdf', '--run', f'diff-pdf --output-diff=diff_attestation.pdf "Attestation de pension d\'invalidité père.pdf" {download_path}']
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        print("Visual differences found! Check diff_attestation.pdf")
        print("diff-pdf output:")
        print(result.stderr.decode())
        exit(1)
    else:
        print("SUCCESS! No visual differences found for identical replacement!")

if __name__ == '__main__':
    test_attestation()
