let pdfDocument = null;
let pdfBytes = null; 
let currentPage = 1;
let currentScale = 1.5;
let pageTextContent = null;
let modifications = []; 

// UI Elements
const fileInput = document.getElementById('file-upload');
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const textLayerDiv = document.getElementById('text-layer');
const downloadBtn = document.getElementById('download-btn');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const paginationControls = document.getElementById('pagination-controls');

// Popup Elements
const popup = document.getElementById('edit-popup');
const editInput = document.getElementById('edit-input');
const fontSelect = document.getElementById('edit-font');
const customFontUpload = document.getElementById('custom-font-upload');
const saveBtn = document.getElementById('save-edit-btn');
const cancelBtn = document.getElementById('cancel-edit-btn');

let currentEditContext = null;
let customFontBytes = null;
let fontCache = {}; // Cache loaded standard fonts

const STANDARD_FONTS = [
    'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
    'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
    'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
    'Symbol', 'ZapfDingbats'
];

const SERVER_FONTS = {
    'Arial': 'fonts/Arial.ttf',
    'ArialMT': 'fonts/Arial.ttf',
    'Arial-BoldMT': 'fonts/Arial-Bold.ttf',
    'Arial,Bold': 'fonts/Arial-Bold.ttf',
    'Arial,Italic': 'fonts/Arial-Italic.ttf',
    'Arial,BoldItalic': 'fonts/Arial-BoldItalic.ttf',
    'ArialNarrow': 'fonts/ArialNarrow.ttf',
    'ArialNarrow-Bold': 'fonts/ArialNarrow.ttf', // Fallback to regular narrow since we don't have bold narrow
    'ArialNarrow-Italic': 'fonts/ArialNarrow.ttf',
    'ArialNarrow-BoldItalic': 'fonts/ArialNarrow.ttf',
    'ArialNarrow,Bold': 'fonts/ArialNarrow.ttf',
    'ArialNarrow,Italic': 'fonts/ArialNarrow.ttf',
    'ArialNarrow,BoldItalic': 'fonts/ArialNarrow.ttf',
    'TimesNewRoman': 'fonts/TimesNewRoman.ttf',
    'TimesNewRomanPSMT': 'fonts/TimesNewRoman.ttf',
    'TimesNewRoman,Bold': 'fonts/TimesNewRoman-Bold.ttf',
    'TimesNewRoman,Italic': 'fonts/TimesNewRoman-Italic.ttf',
    'TimesNewRoman,BoldItalic': 'fonts/TimesNewRoman-BoldItalic.ttf',
    'CourierNew': 'fonts/CourierNew.ttf',
    'CourierNew,Bold': 'fonts/CourierNew-Bold.ttf',
    'CourierNew,Italic': 'fonts/CourierNew-Italic.ttf',
    'CourierNew,BoldItalic': 'fonts/CourierNew-BoldItalic.ttf'
};

// Handle file upload
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const buffer = event.target.result;
        const typedArray = new Uint8Array(buffer);
        
        // Scan for unsupported fonts
        try {
            console.log("Loading temp doc...");
            const tempDoc = await pdfjsLib.getDocument(typedArray.slice(0)).promise;
            console.log("Temp doc loaded, pages:", tempDoc.numPages);
            const unsupportedFonts = new Set();
            
            for (let i = 1; i <= tempDoc.numPages; i++) {
                const tempPage = await tempDoc.getPage(i);
                const textContent = await tempPage.getTextContent();
                
                const fontIds = new Set();
                for (const item of textContent.items) {
                    if (item.str.trim() !== '') fontIds.add(item.fontName);
                }
                
                await tempPage.getOperatorList(); // Resolves all fonts into commonObjs
                
                for (const fontId of fontIds) {
                    try {
                        const font = tempPage.commonObjs.get(fontId);
                        let fName = (font && font.name) ? font.name : fontId;
                        let realName = fName.includes('+') ? fName.split('+')[1] : fName;
                        
                        // Resolve standard or server font
                        if (!STANDARD_FONTS.includes(realName) && !SERVER_FONTS[realName] && fontSelect.value !== 'custom') {
                            unsupportedFonts.add(realName);
                        }
                    } catch (e) {
                        console.error("Failed to get font info for", fontId, e);
                    }
                }
            }
            console.log("Font check complete, unsupported:", Array.from(unsupportedFonts));
            
            if (unsupportedFonts.size > 0) {
                alert("Error: This PDF contains unsupported fonts: " + Array.from(unsupportedFonts).join(', ') + ".\nOnly standard PDF fonts are supported unless you upload a custom font first.");
                fileInput.value = '';
                return; // Stop loading
            }
        } catch (err) {
            console.error("Font scan failed:", err);
        }

        console.log("Proceeding to render...");
        // Font check passed, proceed to load
        pdfBytes = typedArray;
        pdfDocument = await pdfjsLib.getDocument(typedArray.slice(0)).promise;
        downloadBtn.disabled = false;
        paginationControls.style.display = 'flex';
        
        // Hide the manual font selector if they didn't explicitly choose custom!
        if (fontSelect.value !== 'custom') {
            fontSelect.style.display = 'none';
        }
        
        currentPage = 1;
        renderPage(currentPage);
    };
    reader.readAsArrayBuffer(file);
});

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
    }
});

nextPageBtn.addEventListener('click', () => {
    if (pdfDocument && currentPage < pdfDocument.numPages) {
        currentPage++;
        renderPage(currentPage);
    }
});

async function renderPage(pageNum) {
    const page = await pdfDocument.getPage(pageNum);
    pageInfo.textContent = `Page ${pageNum} of ${pdfDocument.numPages}`;
    
    const viewport = page.getViewport({ scale: currentScale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    document.getElementById('pdf-container').style.width = `${viewport.width}px`;
    document.getElementById('pdf-container').style.height = `${viewport.height}px`;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    textLayerDiv.innerHTML = ''; 
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);

    pageTextContent = await page.getTextContent();
    console.log("FIRST TEXT ITEM:", pageTextContent.items[0]);
    
    await pdfjsLib.renderTextLayer({
        textContent: pageTextContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    }).promise;
    
    const spans = textLayerDiv.querySelectorAll('span');
    spans.forEach((span, index) => {
        span.dataset.itemIndex = index;
    });
}

textLayerDiv.addEventListener('mouseup', (e) => {
    setTimeout(() => {
        const selection = window.getSelection();
        if (selection.isCollapsed || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = selection.toString().replace(/\n/g, ' '); // normalize newlines
        if (!selectedText.trim()) return;

        // Get the visual bounding box of the highlighted text
        let totalRect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (const rect of range.getClientRects()) {
            if (rect.width === 0 || rect.height === 0) continue;
            totalRect.left = Math.min(totalRect.left, rect.left);
            totalRect.top = Math.min(totalRect.top, rect.top);
            totalRect.right = Math.max(totalRect.right, rect.right);
            totalRect.bottom = Math.max(totalRect.bottom, rect.bottom);
        }

        // Find the first pdf.js span that intersects this box to get font metadata
        const spans = Array.from(textLayerDiv.querySelectorAll('span[data-item-index]'));
        let intersectingItem = null;
        let detectedFont = null;
        let detectedColor = null;
        let detectedFontFamily = 'Helvetica'; // Fallback
        let detectedItemIndex = -1;

        for (const span of spans) {
            const spanRect = span.getBoundingClientRect();
            // Check for intersection with the visual bounding box
            if (!(spanRect.right < totalRect.left || spanRect.left > totalRect.right || 
                  spanRect.bottom < totalRect.top || spanRect.top > totalRect.bottom)) {
                
                const index = parseInt(span.dataset.itemIndex);
                const item = pageTextContent.items[index];
                
                // We skip pure spaces when doing font/color checks because they often lack color/font properties
                if (item.str.trim() !== '') {
                    const itemColorStr = item.color ? item.color.join(',') : '0,0,0';
                    
                    if (!detectedFont) {
                        detectedFont = item.fontName;
                        detectedColor = itemColorStr;
                        intersectingItem = item;
                        detectedItemIndex = index;
                        
                        // Extract standard font name synchronously
                        try {
                            const fontObj = page.commonObjs.get(detectedFont);
                            let fName = (fontObj && fontObj.name) ? fontObj.name : detectedFont;
                            let realName = fName.includes('+') ? fName.split('+')[1] : fName;
                            
                            if (STANDARD_FONTS.includes(realName) || SERVER_FONTS[realName]) {
                                detectedFontFamily = realName;
                            }
                        } catch (e) {
                            console.error("Could not get font name in mouseup:", e);
                        }
                    } else if (detectedFont !== item.fontName || detectedColor !== itemColorStr) {
                        alert("Error: You cannot highlight text that spans multiple fonts or colors.");
                        window.getSelection().removeAllRanges();
                        return;
                    }
                } else if (!intersectingItem) {
                    intersectingItem = item; // Fallback to space if absolutely nothing else is found
                    detectedItemIndex = index;
                }
            }
        }

        if (!intersectingItem) return;

        // Convert totalRect to relative to the container
        const containerRect = textLayerDiv.getBoundingClientRect();
        const relRect = {
            left: totalRect.left - containerRect.left,
            top: totalRect.top - containerRect.top,
            width: totalRect.right - totalRect.left,
            height: totalRect.bottom - totalRect.top
        };

        showPopup(relRect.left + 10, relRect.top + 10, intersectingItem, selectedText, relRect, detectedFontFamily, detectedItemIndex);
    }, 10);
});

function showPopup(x, y, item, selectedText, relRect, autoFont, itemIndex) {
    currentEditContext = { item, originalStr: selectedText, relRect, autoFont, itemIndex };
    
    popup.style.left = `${x}px`;
    popup.style.top = `${y + 20}px`;
    popup.classList.remove('hidden');
    
    editInput.value = selectedText; 
    editInput.maxLength = selectedText.length; 
    
    editInput.style.width = `${Math.max(100, relRect.width)}px`;
    editInput.focus();
}

fontSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
        customFontUpload.click();
    }
});

customFontUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        customFontBytes = await file.arrayBuffer();
        alert("Custom font loaded successfully!");
    } else {
        fontSelect.value = 'Helvetica'; // Reset if cancelled
    }
});

cancelBtn.addEventListener('click', () => {
    popup.classList.add('hidden');
    currentEditContext = null;
    window.getSelection().removeAllRanges();
});

saveBtn.addEventListener('click', () => {
    if (!currentEditContext) return;
    
    const newText = editInput.value;
    if (newText.length > currentEditContext.originalStr.length) {
        alert("Text must be the same length or shorter!");
        return;
    }

    if (fontSelect.value === 'custom' && !customFontBytes) {
        alert("Please upload a custom font file first, or select a standard font.");
        return;
    }

    const fontColorArray = currentEditContext.item.color || [0, 0, 0];
    const cssColor = `rgb(${fontColorArray[0]}, ${fontColorArray[1]}, ${fontColorArray[2]})`;

    // Remove any previous edit for this exact text item to prevent stacking
    modifications = modifications.filter(mod => 
        !(mod.pageIndex === (currentPage - 1) && mod.itemIndex === currentEditContext.itemIndex)
    );

    modifications.push({
        pageIndex: currentPage - 1, 
        item: currentEditContext.item,
        itemIndex: currentEditContext.itemIndex,
        newText: newText.padEnd(currentEditContext.originalStr.length, ' '), 
        fontChoice: fontSelect.value,
        customFontBytes: fontSelect.value === 'custom' ? customFontBytes : null,
        autoFont: currentEditContext.autoFont,
        relRect: currentEditContext.relRect,
        originalStr: currentEditContext.originalStr,
        cssColor: cssColor,
        colorArray: fontColorArray
    });
    
    // Visually update the canvas with an overlay so the user sees their edit
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = `${currentEditContext.relRect.left}px`;
    overlay.style.top = `${currentEditContext.relRect.top}px`;
    overlay.style.width = `${currentEditContext.relRect.width}px`;
    overlay.style.height = `${currentEditContext.relRect.height}px`;
    overlay.style.backgroundColor = 'white';
    overlay.style.color = cssColor;
    overlay.style.fontSize = `${currentEditContext.relRect.height * 0.8}px`; // approximate
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'flex-start'; // Align normally
    overlay.style.fontFamily = currentEditContext.autoFont || fontSelect.value || 'sans-serif'; // Try to use the actual font name
    overlay.style.whiteSpace = 'pre'; // Preserve spaces
    overlay.textContent = newText;
    document.getElementById('pdf-container').appendChild(overlay);

    popup.classList.add('hidden');
    currentEditContext = null;
    window.getSelection().removeAllRanges();
    alert("Edit saved. Click 'Download Modified PDF' when done.");
});

async function getFontForMod(pdfDoc, mod) {
    if (mod.fontChoice === 'custom' && mod.customFontBytes) {
        // Register fontkit if it hasn't been already
        if (!pdfDoc.isFontkitRegistered) {
            pdfDoc.registerFontkit(fontkit);
            pdfDoc.isFontkitRegistered = true;
        }
        return await pdfDoc.embedFont(mod.customFontBytes);
    }
    
    const fontEnum = mod.autoFont || mod.fontChoice; // Use auto detected font if available
    
    if (SERVER_FONTS[fontEnum]) {
        if (!fontCache[fontEnum]) {
            if (!pdfDoc.isFontkitRegistered) {
                pdfDoc.registerFontkit(fontkit);
                pdfDoc.isFontkitRegistered = true;
            }
            const res = await fetch(SERVER_FONTS[fontEnum]);
            if (!res.ok) throw new Error("Could not fetch server font " + SERVER_FONTS[fontEnum]);
            const fontBytes = await res.arrayBuffer();
            fontCache[fontEnum] = await pdfDoc.embedFont(fontBytes);
        }
        return fontCache[fontEnum];
    }
    
    // Otherwise it's a standard font
    if (!fontCache[fontEnum]) {
        fontCache[fontEnum] = await pdfDoc.embedFont(fontEnum);
    }
    return fontCache[fontEnum];
}

downloadBtn.addEventListener('click', async () => {
    if (!pdfBytes) return;

    try {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Processing...';

        const typedArray = new Uint8Array(pdfBytes);
        const pdfDoc = await PDFLib.PDFDocument.load(typedArray);
        const pages = pdfDoc.getPages();
        fontCache = {}; // Reset cache for new doc

        for (const mod of modifications) {
            const page = pages[mod.pageIndex];
            
            const item = mod.item;
            const tx = item.transform;
            const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
            
            // Determine font based on user selection
            const font = await getFontForMod(pdfDoc, mod);

            // Convert relative screen rect to PDF coordinates
            const pdfX = mod.relRect.left / currentScale;
            const pdfWidth = mod.relRect.width / currentScale;
            // The baseline Y in PDF coordinates is tx[5].
            const baselineY = tx[5];

            // Draw white redaction rectangle EXACTLY over the highlight box
            page.drawRectangle({
                x: pdfX,
                y: baselineY - (fontSize * 0.2), 
                width: pdfWidth,
                height: fontSize * 1.2, 
                color: PDFLib.rgb(1, 1, 1), 
            });
            
            // Calculate if we need to horizontally scale down (e.g., fallback font is wider than original Arial Narrow)
            const textWidth = font.widthOfTextAtSize(mod.newText, fontSize);
            let scaleFactor = 100;
            const fontColor = PDFLib.rgb(mod.colorArray[0]/255, mod.colorArray[1]/255, mod.colorArray[2]/255);
            
            // Only scale down (compress), never scale up. Limit compression to 60% to remain readable.
            if (textWidth > pdfWidth) {
                scaleFactor = Math.max((pdfWidth / textWidth) * 100, 60);
            }
            
            if (scaleFactor !== 100) {
                page.pushOperators(PDFLib.PDFOperator.of('Tz', [PDFLib.PDFNumber.of(scaleFactor)]));
            }

            page.drawText(mod.newText, {
                x: pdfX,
                y: baselineY, 
                size: fontSize,
                font: font,
                color: fontColor, 
            });
            
            if (scaleFactor !== 100) {
                page.pushOperators(PDFLib.PDFOperator.of('Tz', [PDFLib.PDFNumber.of(100)])); // Reset
            }
        }

        const modifiedBytes = await pdfDoc.save();
        const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modified_document.pdf';
        a.click();
        
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error(err);
        alert("An error occurred during download: " + err.message);
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Modified PDF';
    }
});
