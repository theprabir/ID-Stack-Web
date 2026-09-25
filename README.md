# ID Card Design & Batch Printing Software

## 🎯 Overview
A professional, open-source ID card design and batch printing software that runs entirely in your browser. No installation, no backend, no server. Just open the URL and start designing.

## ✨ Features
- Photoshop-like template editor with layers, effects, and precision tools
- Dual-sided templates (Front + Back)
- Excel data import with placeholder mapping
- Batch photo import with auto-matching
- Batch generation of hundreds of ID cards in seconds
- PSD file import (Photoshop designs)
- Pre-designed template library
- Print-ready PDF export with imposition (multiple cards per sheet)
- Same-sheet duplex layout (fronts row 1, backs row 2)
- 3 numbering modes (per-sheet, continuous, none)
- Custom font upload + bundled web fonts
- Drop shadows, strokes, borders, and other effects
- Dark and Light theme support
- 11 languages: English, Hindi, Marathi, Odia, Bengali, Tamil, Telugu, Kannada, Gujarati, Punjabi, Spanish
- Works offline (PWA)
- 100% client-side — your data never leaves your device

## 🖥️ System Requirements
- Modern browser: Chrome 110+, Firefox 115+, Edge 110+, Safari 16+
- No installation required
- Works on Windows, macOS, Linux

## 🌐 Live Demo
[Deploy to Vercel/Netlify and add link here]

## 🚀 Quick Start
1. Open the app URL
2. Create a new template or choose from the library
3. Design front and back sides
4. Import Excel data
5. Import photos
6. Generate ID cards
7. Export as individual files or print-ready PDF

## 📖 Documentation
See the `docs/` folder for:
- User manual
- Keyboard shortcuts
- Troubleshooting guide

## 🛠️ For Developers

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Installation
```bash
git clone <repo-url>
cd id-card-software
pnpm install
```

### Development
```bash
pnpm dev
```

### Build
```bash
pnpm build
```

### Test
```bash
pnpm test
```

### Deploy
Push to main branch — auto-deploys to Vercel/Netlify.

## 🌍 Supported Languages
English, Hindi (हिंदी), Marathi (मराठी), Odia (ଓଡ଼ିଆ), Bengali (বাংলা), Tamil (தமிழ்), Telugu (తెలుగు), Kannada (ಕನ್ನಡ), Gujarati (ગુજરાતી), Punjabi (ਪੰਜਾਬੀ), Spanish (Español)

## 📄 License
MIT License - see LICENSE file

## 🤝 Contributing
Contributions welcome! Please read the guidelines before submitting PRs.

## 🐛 Reporting Issues
Use GitHub Issues to report bugs or request features.

## 📊 Project Status
**Current Phase:** 0 (Initialization)
**Status:** Setting up project structure and documentation

### Completed
- Project initialization: `README.md`, `LICENSE`, `.gitignore` in place
- Design specification (`Design.md`) and technical architecture (`Architecture.md`) defined

### Working Features
- None yet — implementation begins with Phase 1

### Known Issues
- None

### Next Steps
- **Phase 1 — Project Foundation:** Vite + React + TypeScript setup, Tailwind + shadcn/ui, routing, Zustand, i18n (11 languages), main layout (Header/Sidebar/Footer), IndexedDB (Dexie.js), PWA (vite-plugin-pwa), ESLint + Prettier, Vitest

## 🙏 Acknowledgments
Built with:
- React + TypeScript
- Fabric.js (canvas editor)
- SheetJS (Excel parsing)
- ag-psd (PSD import)
- pdf-lib (PDF generation)
- i18next (internationalization)
- Tailwind CSS + shadcn/ui (UI)
- Vite (build tool)

## 📞 Support
Open an issue on GitHub or contact the maintainers.
