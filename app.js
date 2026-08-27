let pdfDocument = null;
let pdfBytes = null; 
let currentPage = 1;
let currentScale = 1.5;
let pageTextContent = null;
let modifications = []; 

// UI Elements
const fileInput = document.getElementById('file-upload');
const browseBtn = document.getElementById('browse-btn');
browseBtn.addEventListener('click', () => fileInput.click());
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const textLayerDiv = document.getElementById('text-layer');
const downloadBtn = document.getElementById('download-btn');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const paginationControls = document.getElementById('pagination-controls');
const addFontBtn = document.getElementById('add-font-btn');
const addFontUpload = document.getElementById('add-font-upload');

// Edit Controls
const editControls = document.getElementById('edit-controls');
const editInput = document.getElementById('edit-input');
const saveBtn = document.getElementById('save-edit-btn');

let currentEditContext = null;
let customFontBytes = null;
let fontCache = {}; // Cache loaded standard fonts
let USER_FONTS = {}; // Stores { 'FontName': ArrayBuffer } for fonts added by the user

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
    'ArialNarrow-Bold': 'fonts/Arial-Bold.ttf', // Fallback to Arial-Bold (will be horizontally compressed by Tz to look narrow)
    'ArialNarrow-Italic': 'fonts/Arial-Italic.ttf',
    'ArialNarrow-BoldItalic': 'fonts/Arial-BoldItalic.ttf',
    'ArialNarrow,Bold': 'fonts/Arial-Bold.ttf',
    'ArialNarrow,Italic': 'fonts/Arial-Italic.ttf',
    'ArialNarrow,BoldItalic': 'fonts/Arial-BoldItalic.ttf',
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
                        if (!STANDARD_FONTS.includes(realName) && !SERVER_FONTS[realName] && !USER_FONTS[realName]) {
                            unsupportedFonts.add(realName);
                        }
                    } catch (e) {
                        console.error("Failed to get font info for", fontId, e);
                    }
                }
            }
            console.log("Font check complete, unsupported:", Array.from(unsupportedFonts));
            
            if (unsupportedFonts.size > 0) {
                alert("Ce PDF contient des polices propriétaires non prises en charge : " + Array.from(unsupportedFonts).join(', ') + ".\nPour une correspondance visuelle parfaite, veuillez d'abord ajouter les fichiers .ttf correspondants via le bouton Ajouter une police.");
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
        paginationControls.style.visibility = 'visible';
        
        // Hide the manual font selector if they didn't explicitly choose custom!
        
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
    pageInfo.textContent = `Page ${pageNum} sur ${pdfDocument.numPages}`;
    
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
    setTimeout(async () => {
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
        
        let pdfPage = null;
        try { pdfPage = await pdfDocument.getPage(currentPage); } catch(err) { console.error(err); }
        if (!pdfPage) return;
        const viewport = pdfPage.getViewport({ scale: currentScale });

        // Convert totalRect to relative to the container
        const containerRect = textLayerDiv.getBoundingClientRect();
        const relRect = {
            left: totalRect.left - containerRect.left,
            top: totalRect.top - containerRect.top,
            width: totalRect.right - totalRect.left,
            height: totalRect.bottom - totalRect.top
        };

        // Find the pdf.js item that intersects this box with the maximum overlap area
        let bestItem = null;
        let maxArea = 0;
        let bestIndex = -1;

        for (let i = 0; i < pageTextContent.items.length; i++) {
            const item = pageTextContent.items[i];
            if (item.str.trim() === '') continue;

            const tx = item.transform;
            const itemX = tx[4] * currentScale;
            // PDF coordinates are bottom-up, we convert to top-down relative to the container
            // The font size/height is roughly tx[3] (or tx[0])
            const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
            const itemHeight = fontSize * currentScale;
            // tx[5] is the baseline. The top of the text is roughly baselineY + height
            const itemY = viewport.height - (tx[5] * currentScale) - itemHeight;
            const itemWidth = item.width * currentScale;
            
            // Calculate intersection rectangle
            const interLeft = Math.max(itemX, relRect.left);
            const interTop = Math.max(itemY, relRect.top);
            const interRight = Math.min(itemX + itemWidth, relRect.left + relRect.width);
            const interBottom = Math.min(itemY + itemHeight, relRect.top + relRect.height);
            
            if (interRight > interLeft && interBottom > interTop) {
                const area = (interRight - interLeft) * (interBottom - interTop);
                if (area > maxArea) {
                    maxArea = area;
                    bestIndex = i;
                    bestItem = item;
                }
            }
        }

        let intersectingItem = null;
        let detectedFont = null;
        let detectedColor = null;
        let detectedFontFamily = 'Helvetica'; // Fallback
        let detectedItemIndex = -1;
        
        if (bestItem) {
            intersectingItem = bestItem;
            detectedItemIndex = bestIndex;
            detectedFont = bestItem.fontName;
            detectedColor = bestItem.color ? bestItem.color.join(',') : '0,0,0';
            
            // Extract standard font name synchronously
            try {
                const fontObj = pdfPage ? pdfPage.commonObjs.get(detectedFont) : null;
                let fName = (fontObj && fontObj.name) ? fontObj.name : detectedFont;
                let realName = fName.includes('+') ? fName.split('+')[1] : fName;
                
                if (STANDARD_FONTS.includes(realName) || SERVER_FONTS[realName] || USER_FONTS[realName]) {
                    detectedFontFamily = realName;
                }
            } catch (e) {
                console.error("Could not get font name in mouseup:", e);
            }
        }

        if (!intersectingItem) {
            console.log("No intersecting item found. totalRect:", totalRect);
            return;
        }
        console.log("Found intersecting item:", intersectingItem.str);


        showPopup(intersectingItem, selectedText, relRect, detectedFontFamily, detectedItemIndex);
    }, 10);
});

function showPopup(item, selectedText, relRect, autoFont, itemIndex) {
    currentEditContext = { item, originalStr: selectedText, relRect, autoFont, itemIndex };
    
    editInput.disabled = false;
    saveBtn.disabled = false;
    editInput.value = selectedText;
    editInput.maxLength = selectedText.length;
    editInput.focus();
}




saveBtn.addEventListener('click', () => {
    if (!currentEditContext) return;
    
    const newText = editInput.value;
    if (newText.length > currentEditContext.originalStr.length) {
        alert("Le texte doit être de la même longueur ou plus court !");
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
    overlay.style.fontFamily = currentEditContext.autoFont || 'sans-serif'; // Try to use the actual font name
    overlay.style.whiteSpace = 'pre'; // Preserve spaces
    overlay.textContent = newText;
    document.getElementById('pdf-container').appendChild(overlay);

    editInput.disabled = true; saveBtn.disabled = true; editInput.value = '';
    currentEditContext = null;
    window.getSelection().removeAllRanges();
});

async function getFontForMod(pdfDoc, mod) {
    
    const fontEnum = mod.autoFont; // Use auto detected font if available
    
    if (USER_FONTS[fontEnum]) {
        if (!fontCache[fontEnum]) {
            if (!pdfDoc.isFontkitRegistered) {
                pdfDoc.registerFontkit(fontkit);
                pdfDoc.isFontkitRegistered = true;
            }
            fontCache[fontEnum] = await pdfDoc.embedFont(USER_FONTS[fontEnum]);
        }
        return fontCache[fontEnum];
    }
    
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
        downloadBtn.textContent = 'Traitement en cours...';

        const typedArray = new Uint8Array(pdfBytes);
        const pdfDoc = await PDFLib.PDFDocument.load(typedArray);
        const pages = pdfDoc.getPages();
        fontCache = {}; // Reset cache for new doc

        for (const mod of modifications) {

            const page = pages[mod.pageIndex];
            
            const item = mod.item;
            const font = await getFontForMod(pdfDoc, mod);
            const tx = item.transform;
            const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
            
            // Recompute PDF width based on the visual box
            const pdfWidth = mod.relRect.width / currentScale;
            const pdfX = mod.relRect.left / currentScale;
            
            // The baseline Y in PDF coordinates is tx[5].
            const baselineY = tx[5];

            // Calculate true PDF width of the replaced text
            let truePdfWidth = pdfWidth;
            if (item && typeof item.width === 'number') {
                if (item.str.length > 0) {
                    truePdfWidth = item.width * (mod.originalStr.length / item.str.length);
                }
            }
            if (isNaN(truePdfWidth) || truePdfWidth === undefined) {
                truePdfWidth = pdfWidth;
            }

            // Draw white redaction rectangle EXACTLY over the highlight box
            page.drawRectangle({
                x: pdfX,
                y: baselineY - (fontSize * 0.2), 
                width: truePdfWidth,
                height: fontSize * 1.2, 
                color: PDFLib.rgb(1, 1, 1), 
            });
            
            // Calculate if we need to horizontally scale down
            const textWidth = font.widthOfTextAtSize(mod.newText, fontSize);
            let scaleFactor = 100;
            const fontColor = PDFLib.rgb(mod.colorArray[0]/255, mod.colorArray[1]/255, mod.colorArray[2]/255);
            
            // Only scale down (compress), never scale up. Limit compression to 60% to remain readable.
            if (textWidth > truePdfWidth && textWidth > 0) {
                scaleFactor = Math.max((truePdfWidth / textWidth) * 100, 60);
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
        alert("Une erreur s'est produite lors du téléchargement : " + err.message);
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Télécharger le PDF modifié';
    }
});

addFontBtn.addEventListener('click', () => {
    addFontUpload.click();
});

addFontUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            const buffer = await file.arrayBuffer();
            const font = window.fontkit.create(new Uint8Array(buffer));
            const fontName = font.postscriptName;
            USER_FONTS[fontName] = buffer;
            USER_FONTS[font.familyName] = buffer;
            // Add a stripped name for standard matching
            let strippedName = fontName.includes('+') ? fontName.split('+')[1] : fontName;
            USER_FONTS[strippedName] = buffer;
            alert(`Police ajoutée : ${fontName}`);
        } catch (err) {
            console.error(err);
            alert("Échec du chargement de la police. Assurez-vous qu'il s'agit d'un fichier TTF/OTF valide.");
        }
    }
    addFontUpload.value = ''; // Reset
});

editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveBtn.click();
    }
});
