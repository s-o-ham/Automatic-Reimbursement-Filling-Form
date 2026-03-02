const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parse } = require('csv-parse/sync');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

/**
 * Converts an uploaded file to an array of PNG images (one per page).
 * Supports: PDF, DOC, DOCX, CSV, PNG
 * @param {string} filePath - Path to the uploaded file
 * @param {string} originalName - Original filename (for extension detection)
 * @returns {Promise<string[]>} - Array of PNG paths (one per page)
 */
async function convertToImages(filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();

    switch (ext) {
        case '.pdf':
            return await pdfToImages(filePath);
        case '.doc':
        case '.docx':
            return await docToImages(filePath);
        case '.csv':
            return [await csvToImage(filePath)];
        case '.png': {
            // Already an image — copy with a unique name so cleanup is uniform
            const dest = path.join(UPLOADS_DIR, `img_${uuidv4()}.png`);
            fs.copyFileSync(filePath, dest);
            return [dest];
        }
        default:
            throw new Error(`Unsupported file type: ${ext}`);
    }
}

/**
 * Convert ALL pages of a PDF to PNG images using pdftoppm.
 * Returns an array of PNG paths, one per page.
 */
async function pdfToImages(filePath) {
    const outputBase = path.join(UPLOADS_DIR, `img_${uuidv4()}`);
    try {
        // Without -singlefile, pdftoppm renders every page:
        //   outputBase-1.png, outputBase-2.png ... (or zero-padded: -001, -002)
        execSync(`pdftoppm -r 150 -png "${filePath}" "${outputBase}"`, {
            timeout: 60000,
        });

        // Collect all generated files matching the prefix
        const dir = path.dirname(outputBase);
        const prefix = path.basename(outputBase) + '-';
        const files = fs
            .readdirSync(dir)
            .filter((f) => f.startsWith(path.basename(outputBase)) && f.endsWith('.png'))
            .sort()
            .map((f) => path.join(dir, f));

        if (files.length === 0) {
            throw new Error('pdftoppm produced no output files.');
        }
        return files;
    } catch (err) {
        throw new Error(`PDF conversion failed: ${err.message}`);
    }
}

/**
 * Convert DOC/DOCX → PDF via LibreOffice → then all pages to PNGs.
 */
async function docToImages(filePath) {
    const tempPdfDir = UPLOADS_DIR;

    try {
        execSync(
            `soffice --headless --convert-to pdf --outdir "${tempPdfDir}" "${filePath}"`,
            { timeout: 60000 }
        );

        const baseName = path.basename(filePath, path.extname(filePath));
        const pdfPath = path.join(tempPdfDir, `${baseName}.pdf`);

        if (!fs.existsSync(pdfPath)) {
            throw new Error('LibreOffice did not produce a PDF.');
        }

        const images = await pdfToImages(pdfPath);

        try { fs.unlinkSync(pdfPath); } catch (e) { /* ok */ }

        return images;
    } catch (err) {
        throw new Error(`DOC/DOCX conversion failed: ${err.message}`);
    }
}

/**
 * Convert CSV → styled HTML table → single PNG via Puppeteer.
 */
async function csvToImage(filePath) {
    const outputPath = path.join(UPLOADS_DIR, `img_${uuidv4()}.png`);

    try {
        const csvContent = fs.readFileSync(filePath, 'utf8');
        const records = parse(csvContent, {
            skip_empty_lines: true,
            relax_column_count: true,
        });

        if (!records || records.length === 0) {
            throw new Error('CSV file is empty or could not be parsed.');
        }

        const headers = records[0];
        const rows = records.slice(1);

        const tableRows = rows
            .map(
                (row) =>
                    `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`
            )
            .join('');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; background: #fff; margin: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { background: #4f46e5; color: white; padding: 10px 14px; text-align: left; font-weight: 600; }
  td { padding: 8px 14px; border-bottom: 1px solid #e5e7eb; color: #374151; }
  tr:nth-child(even) td { background: #f9fafb; }
  tr:hover td { background: #ede9fe; }
</style>
</head>
<body>
<table>
  <thead><tr>${headers.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('')}</tr></thead>
  <tbody>${tableRows}</tbody>
</table>
</body>
</html>`;

        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: 'new',
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.setViewport({ width: 1100, height: 800 });

        const tableHandle = await page.$('table');
        if (tableHandle) {
            await tableHandle.screenshot({ path: outputPath });
        } else {
            await page.screenshot({ path: outputPath, fullPage: true });
        }
        await browser.close();
        return outputPath;
    } catch (err) {
        throw new Error(`CSV conversion failed: ${err.message}`);
    }
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = { convertToImages };
