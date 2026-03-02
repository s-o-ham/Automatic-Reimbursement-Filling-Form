# Reimbursement Document Generator

A full-stack web application that lets you upload a bill (PDF, DOC, DOCX, or CSV), pick a date, and instantly download a professional reimbursement PDF with a rendered preview of the uploaded document.

---

## 📁 Project Structure

```
Reimbursements/
├── frontend/          # Vite + React app
│   ├── src/
│   │   ├── App.jsx    # Main UI component
│   │   └── App.css    # Glassmorphism dark theme
│   └── vite.config.js # /api proxy → backend
│
├── backend/           # Node.js + Express server
│   ├── index.js       # Server entry point
│   ├── routes/
│   │   └── generate.js    # POST /api/generate
│   └── services/
│       ├── fileConverter.js   # File → PNG conversion
│       └── pdfGenerator.js    # PDF generation (PDFKit)
│
└── vercel.json        # Vercel deployment config
```

---

## 🚀 Quick Start

### 1. Install System Dependencies

```bash
sudo apt install poppler-utils libreoffice chromium-browser
```

> These handle: PDF rendering (`pdftoppm`), DOC/DOCX conversion (`soffice`), and CSV screenshot (Puppeteer).

### 2. Start the Backend

```bash
cd backend
npm install   # only needed first time
npm run dev   # starts on http://localhost:3001
```

### 3. Start the Frontend

```bash
cd frontend
npm install   # only needed first time
npm run dev   # starts on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## 🧪 Testing

### Browser Test
1. Open http://localhost:5173
2. Drag a PDF file onto the drop zone (or click to browse)
3. Select a date
4. Click **Generate PDF**
5. Click **Download PDF** when green button appears

### CLI Tests (backend only)

```bash
# Health check
curl http://localhost:3001/health

# Generate PDF from a PDF bill
curl -X POST http://localhost:3001/api/generate \
  -F "file=@/path/to/sample.pdf" \
  -F "date=2026-03-02" \
  -o output.pdf

# Generate PDF from CSV
curl -X POST http://localhost:3001/api/generate \
  -F "file=@/path/to/sample.csv" \
  -F "date=2026-03-02" \
  -o output_csv.pdf

# Error: wrong file type (should return 400)
curl -X POST http://localhost:3001/api/generate \
  -F "file=@/path/to/image.png" \
  -F "date=2026-03-02"
# → {"error":"Unsupported file type..."}

# Error: missing date (should return 400)
curl -X POST http://localhost:3001/api/generate \
  -F "file=@/path/to/sample.pdf"
# → {"error":"Date is required."}
```

---

## ✨ Features

| Feature | Details |
|---|---|
| File formats | PDF, DOC, DOCX, CSV |
| Max file size | 10 MB |
| PDF preview | First page rendered as image |
| DOC/DOCX preview | Converted via LibreOffice headless |
| CSV preview | Rendered as styled HTML table screenshot |
| Drag & drop | Full drag-and-drop with hover animation |
| PDF output | Date, filename, unique document ID, file preview |
| Download | Direct browser download |

---

## 🌐 Vercel Deployment

> **Note:** The conversion pipeline (`libreoffice`, `pdftoppm`, Puppeteer) requires a full Linux environment. Deploy the **backend to Railway or Render** and the **frontend to Vercel** for production.

### Deploy Frontend to Vercel
```bash
cd frontend
npm run build
vercel deploy --prod
```

### Deploy Backend to Railway
1. Create a new Railway project
2. Connect the `/backend` folder
3. Set environment variable `PORT=3001`
4. Railway will run `npm start` automatically

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 7 |
| Backend | Node.js 20, Express 4 |
| File upload | Multer 2 |
| PDF generation | PDFKit |
| PDF → image | pdftoppm (poppler-utils) |
| DOC/DOCX → PDF | LibreOffice headless |
| CSV → image | Puppeteer + Chromium |
| Unique IDs | uuid v4 |
