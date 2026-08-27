# PDF Text Editor (Éditeur de texte PDF) 📄✏️

A lightweight, secure, and 100% client-side PDF text editor that allows you to seamlessly modify text within existing PDF documents without altering their original layout.

## 🚀 Quick Start

Run the container using the unprivileged port `8080`:

```bash
docker run -p 8080:8080 progup/pdf-editor:latest
```
*Then navigate to `http://localhost:8080` in your browser.*

## ✨ Key Features
- **100% Client-Side Processing**: Your confidential PDFs never leave your browser. All modifications are processed securely on your local machine using `pdf.js` and `pdf-lib`.
- **In-Place Text Editing**: Simply double-click any text in your PDF to edit it. The app calculates exact bounding boxes and intelligently scales the replacement text to maintain the document's original layout.
- **Dynamic Font Uploads**: Encountering proprietary subsetted fonts? Upload your own `.ttf` fonts directly from the UI to bypass missing font errors and achieve perfect visual alignment.
- **French UI**: The interface is fully translated into French for seamless accessibility.

## 🔐 Security & Integrity
This image is designed with maximum security in mind:
- **Unprivileged Nginx**: Based on `nginxinc/nginx-unprivileged:alpine`, this container runs as a restricted, non-root `nginx` user to prevent privilege escalation.
- **Trivy Scanned**: This image is continuously scanned for OS and library vulnerabilities during the CI/CD build process.
- **Sigstore Cosign**: The image is cryptographically signed using GitHub OIDC (Keyless signing), ensuring its authenticity and integrity.

## 🔗 Links
- **Source Code**: [GitHub Repository](https://github.com/Prog-up/pdf-editor)
