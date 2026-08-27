let pdfDocument = null;
let pdfBytes = null; // Original PDF bytes for pdf-lib
let currentPage = 1;
let currentScale = 1.5;
let pageTextContent = null;
let modifications = []; // Store edits: { pageIndex, itemIndex, newText, rect, originalItem }

// UI Elements
const fileInput = document.getElementById('file-upload');
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const textLayerDiv = document.getElementById('text-layer');
const downloadBtn = document.getElementById('download-btn');

// Popup Elements
const popup = document.getElementById('edit-popup');
const editInput = document.getElementById('edit-input');
const saveBtn = document.getElementById('save-edit-btn');
const cancelBtn = document.getElementById('cancel-edit-btn');

let currentEditContext = null;

// Handle file upload
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        pdfBytes = await file.arrayBuffer();
        const typedArray = new Uint8Array(pdfBytes);
        
        // Load with pdf.js
        pdfDocument = await pdfjsLib.getDocument(typedArray).promise;
        downloadBtn.disabled = false;
        
        // Render first page
        renderPage(currentPage);
    }
});

async function renderPage(pageNum) {
    const page = await pdfDocument.getPage(pageNum);
    
    // Set viewport
    const viewport = page.getViewport({ scale: currentScale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    document.getElementById('pdf-container').style.width = `${viewport.width}px`;
    document.getElementById('pdf-container').style.height = `${viewport.height}px`;

    // Render Canvas
    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };
    await page.render(renderContext).promise;

    // Render Text Layer
    textLayerDiv.innerHTML = ''; // Clear old text
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;

    pageTextContent = await page.getTextContent();
    
    await pdfjsLib.renderTextLayer({
        textContent: pageTextContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    }).promise;
    
    // We add our own identifiers to the spans after they render
    const spans = textLayerDiv.querySelectorAll('span');
    spans.forEach((span, index) => {
        span.dataset.itemIndex = index;
    });
}

// Handle Text Selection
document.addEventListener('selectionchange', () => {
    // We wait for mouse up to show popup
});

textLayerDiv.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    if (!selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selectedText = selection.toString();
        
        // Find which span was selected
        // Note: For simplicity, this assumes selection is within a single text item span
        const startNode = range.startContainer.parentNode;
        if (startNode && startNode.dataset && startNode.dataset.itemIndex) {
            const itemIndex = parseInt(startNode.dataset.itemIndex);
            const item = pageTextContent.items[itemIndex];
            
            // Show popup
            showPopup(e.pageX, e.pageY, item, itemIndex, selectedText);
        }
    }
});

function showPopup(x, y, textItem, itemIndex, selectedStr) {
    currentEditContext = { textItem, itemIndex, originalStr: textItem.str };
    
    popup.style.left = `${x}px`;
    popup.style.top = `${y + 20}px`;
    popup.classList.remove('hidden');
    
    editInput.value = textItem.str; // Pre-fill with the whole item string
    editInput.maxLength = textItem.str.length; // Same length constraint
    
    // Try to match styling in the input purely for visual aid
    editInput.style.width = `${textItem.width * currentScale}px`;
    editInput.focus();
}

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

    // Save modification
    modifications.push({
        pageIndex: currentPage - 1, // 0-indexed for pdf-lib
        itemIndex: currentEditContext.itemIndex,
        newText: newText.padEnd(currentEditContext.originalStr.length, ' '), // Pad with spaces to keep length
        item: currentEditContext.textItem
    });
    
    // Visually update the span in HTML so user sees the change
    const span = textLayerDiv.querySelector(`span[data-item-index="${currentEditContext.itemIndex}"]`);
    if (span) {
        span.textContent = newText;
        // Also draw over canvas for visual feedback
        const viewport = canvas.height / 100; // rough check, we should re-render or just draw rect
        // For now, re-rendering is heavy, we'll just wait for download
    }

    popup.classList.add('hidden');
    currentEditContext = null;
    window.getSelection().removeAllRanges();
    alert("Edit saved. Click 'Download Modified PDF' when done.");
});

// Download and modify via pdf-lib
downloadBtn.addEventListener('click', async () => {
    if (!pdfBytes) return;

    // Load into pdf-lib
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    // Embed a standard font (Helvetica)
    const helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    // Apply modifications
    for (const mod of modifications) {
        const page = pages[mod.pageIndex];
        const item = mod.item;
        
        // Extract properties from pdf.js transform
        // transform is [scaleX, skewY, skewX, scaleY, translateX, translateY]
        const tx = item.transform;
        const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]); // Or simply tx[3] for unrotated
        const x = tx[4];
        const y = tx[5];
        const width = item.width;
        // height is roughly the font size
        const height = fontSize;

        // 1. Draw a white redaction rectangle over the old text
        // Note: Coordinates in pdf-lib and pdf.js transform are from bottom-left
        page.drawRectangle({
            x: x,
            y: y, // Might need slight offset depending on font baseline
            width: width,
            height: height * 1.2, // slightly larger to cover ascenders/descenders
            color: PDFLib.rgb(1, 1, 1), // White
        });

        // 2. Draw the new text
        // Calculate character spacing to match the original width
        // pdf-lib's drawText doesn't have a direct "letter spacing" parameter, 
        // but we can draw character by character if needed, or rely on standard spacing
        // For simplicity, we draw it as a single string. If exact spacing is needed, 
        // one must iterate characters and space them evenly over 'width'.
        
        // We'll calculate a wordSpacing or character space workaround
        const textWidth = helveticaFont.widthOfTextAtSize(mod.newText, fontSize);
        const extraSpace = width - textWidth;
        const charSpacing = mod.newText.length > 1 ? extraSpace / (mod.newText.length - 1) : 0;

        // Draw char by char to ensure exact width matching
        let currentX = x;
        for (let i = 0; i < mod.newText.length; i++) {
            const char = mod.newText[i];
            page.drawText(char, {
                x: currentX,
                y: y + (fontSize * 0.2), // slight baseline adjustment
                size: fontSize,
                font: helveticaFont,
                color: PDFLib.rgb(0, 0, 0), // Black (default)
            });
            currentX += helveticaFont.widthOfTextAtSize(char, fontSize) + charSpacing;
        }
    }

    // Save and download
    const modifiedBytes = await pdfDoc.save();
    const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modified_document.pdf';
    a.click();
    
    URL.revokeObjectURL(url);
});
