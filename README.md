# Éditeur de texte PDF (PDF Text Editor) 📄✏️

A lightweight, secure, and 100% client-side PDF text editor that allows you to seamlessly modify text within existing PDF documents without altering their original layout. 

Fully translated into French and designed to create pixel-perfect PDF modifications!

## ✨ Features

- **In-Place Text Editing**: Double-click any text in your PDF to modify it. The app calculates exact bounding boxes and uses intelligent scaling to perfectly align the new text.
- **Dynamic Font Uploads**: Bypasses the limitation of proprietary subsetted fonts by allowing you to upload `.ttf` fonts on the fly directly from the UI.
- **100% Client-Side**: Your confidential PDFs never leave your browser. Processing is done securely on your local machine using `pdf.js` and `pdf-lib`.
- **Zero-Diff Precision**: Modifies the text using advanced horizontal scaling (`Tz`) to ensure the changes are visually indistinguishable from the original document.
- **Secure Docker Deployment**: Shipped with an ultra-lightweight Dockerfile based on `nginxinc/nginx-unprivileged:alpine` (runs as a non-root user).
- **Automated CI/CD Pipeline**: GitHub Actions automatically scans for vulnerabilities using **Trivy**, pushes to Docker Hub, and securely signs the image using **Sigstore Cosign**.

## 🚀 How to Run

### Option 1: Docker (Recommended)
This app is packaged as a secure, unprivileged Nginx container.

```bash
# Build the Docker image
docker build -t pdf-editor .

# Run the container on port 8080
docker run -p 8080:8080 pdf-editor
```
Then navigate to `http://localhost:8080` in your web browser.

### Option 2: Local Python Server
Since it is entirely frontend-based, you can serve it with any simple HTTP server:
```bash
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000`.

## 🛠️ Usage
1. Click **Ouvrir un PDF** (Browse PDF) to load your document.
2. (Optional) If you are modifying text that uses a custom/proprietary font, click **Ajouter une police** to upload the `.ttf` file.
3. Double-click the text you want to edit on the canvas.
4. Type your new text in the top navigation bar and click **Modifier** (Save). *(Note: To maintain layout integrity, the new text must be the same length or shorter than the original text).*
5. Click **Télécharger le PDF modifié** to save your updated file.

## 🔐 Security & Integrity
- **Trivy Scanning**: Every push to `main` is scanned for OS and library vulnerabilities.
- **Sigstore Cosign**: Docker images pushed to Docker Hub are automatically signed via GitHub OIDC. You can verify the image integrity using the extracted image digest hash.
