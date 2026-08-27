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

// Handle file upload
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        pdfBytes = await file.arrayBuffer();
        
        const pdfJsBuffer = pdfBytes.slice(0);
        const typedArray = new Uint8Array(pdfJsBuffer);
        
        pdfDocument = await pdfjsLib.getDocument(typedArray).promise;
        downloadBtn.disabled = false;
        paginationControls.style.display = 'flex';
        
        currentPage = 1;
        renderPage(currentPage);
    }
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
        if (!selection.isCollapsed && selection.rangeCount > 0) {
            const spans = Array.from(textLayerDiv.querySelectorAll('span[data-item-index]'));
            const selectedSpans = spans.filter(span => selection.containsNode(span, true));
            
            if (selectedSpans.length === 0) return;
            
            const selectedItems = selectedSpans.map(span => {
                const index = parseInt(span.dataset.itemIndex);
                return { span, item: pageTextContent.items[index], index };
            });
            
            const fontNames = new Set(selectedItems.map(x => x.item.fontName));
            if (fontNames.size > 1) {
                alert("Error: You have highlighted text containing multiple different fonts. Please select text with a single font.");
                window.getSelection().removeAllRanges();
                return;
            }
            
            const combinedStr = selectedItems.map(x => x.item.str).join('');
            const rect = selectedSpans[0].getBoundingClientRect();
            const containerRect = textLayerDiv.getBoundingClientRect();
            
            showPopup(
                rect.left - containerRect.left + 10,
                rect.top - containerRect.top + 10,
                selectedItems,
                combinedStr
            );
        }
    }, 10);
});

function showPopup(x, y, selectedItems, combinedStr) {
    currentEditContext = { selectedItems, originalStr: combinedStr };
    
    popup.style.left = `${x}px`;
    popup.style.top = `${y + 20}px`;
    popup.classList.remove('hidden');
    
    editInput.value = combinedStr; 
    editInput.maxLength = combinedStr.length; 
    
    let totalWidth = selectedItems.reduce((acc, curr) => acc + curr.item.width, 0);
    editInput.style.width = `${Math.max(100, totalWidth * currentScale)}px`;
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

    modifications.push({
        pageIndex: currentPage - 1, 
        items: currentEditContext.selectedItems,
        newText: newText.padEnd(currentEditContext.originalStr.length, ' '), 
        fontChoice: fontSelect.value,
        customFontBytes: fontSelect.value === 'custom' ? customFontBytes : null
    });
    
    // Visually update the spans
    currentEditContext.selectedItems.forEach((selItem, i) => {
        if (i === 0) selItem.span.textContent = newText;
        else selItem.span.textContent = ''; // Hide others
    });

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
    
    // Otherwise it's a standard font
    const fontEnum = mod.fontChoice; // e.g. "Helvetica"
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
            
            const firstItem = mod.items[0].item;
            const tx = firstItem.transform;
            const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
            
            // Determine font based on user selection
            const font = await getFontForMod(pdfDoc, mod);

            let totalWidth = 0;
            // Draw white redaction rectangles over ALL original text parts
            for (const {item} of mod.items) {
                const ix = item.transform[4];
                const iy = item.transform[5];
                page.drawRectangle({
                    x: ix,
                    y: iy - (fontSize * 0.2), 
                    width: item.width,
                    height: fontSize * 1.2, 
                    color: PDFLib.rgb(1, 1, 1), 
                });
                totalWidth += item.width;
            }
            
            const startX = tx[4];
            const startY = tx[5];
            
            const textWidth = font.widthOfTextAtSize(mod.newText, fontSize);
            const extraSpace = totalWidth - textWidth;
            const charSpacing = mod.newText.length > 1 ? extraSpace / (mod.newText.length - 1) : 0;

            let currentX = startX;
            for (let i = 0; i < mod.newText.length; i++) {
                const char = mod.newText[i];
                page.drawText(char, {
                    x: currentX,
                    y: startY, 
                    size: fontSize,
                    font: font,
                    color: PDFLib.rgb(0, 0, 0), 
                });
                currentX += font.widthOfTextAtSize(char, fontSize) + charSpacing;
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
