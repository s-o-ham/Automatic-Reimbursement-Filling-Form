const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { convertToImages } = require('../services/fileConverter');
const { generatePDF } = require('../services/pdfGenerator');

const router = express.Router();

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.csv', '.png', '.jpg', '.jpeg'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return cb(
                Object.assign(
                    new Error(`Unsupported file type "${ext}". Allowed: pdf, doc, docx, csv, png, jpg`),
                    { status: 400 }
                )
            );
        }
        cb(null, true);
    },
});

// POST /api/generate
// Accepts: files[] (multipart), dates[] (one date string per file, same order)
router.post('/generate', (req, res, next) => {
    upload.array('files', 10)(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'A file exceeds the 10 MB limit.' });
            if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files. Maximum is 10.' });
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }

        const tempFiles = [];

        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded.' });
            }

            // Accept dates[] array (one per file) — or fall back to single date field
            let dates = req.body.dates;
            if (!dates) {
                // legacy single-date fallback
                const single = req.body.date;
                if (!single || !single.trim()) return res.status(400).json({ error: 'Date is required.' });
                dates = req.files.map(() => single.trim());
            } else {
                // Normalize: could be a string (single) or array
                if (!Array.isArray(dates)) dates = [dates];
                dates = dates.map((d) => (d || '').trim());
            }

            console.log(
                'Received files:', req.files.map(f => f.originalname),
                '| dates:', dates
            );

            // Validate each date is present
            for (let i = 0; i < req.files.length; i++) {
                if (!dates[i]) {
                    return res.status(400).json({ error: `Date is required for file "${req.files[i].originalname}".` });
                }
            }

            req.files.forEach((f) => tempFiles.push(f.path));

            const docId = uuidv4();

            // Convert all files — each returns an array of PNGs (one per page)
            const bills = await Promise.all(
                req.files.map(async (file, i) => {
                    const images = await convertToImages(file.path, file.originalname);
                    images.forEach((p) => tempFiles.push(p));
                    return {
                        filename: file.originalname,
                        images,
                        date: dates[i] || dates[0],
                    };
                })
            );

            const pdfBuffer = await generatePDF({ bills, docId });

            const safeDate = bills[0].date.replace(/-/g, '');
            const outputFilename = `reimbursement_${safeDate}_${docId.slice(0, 8)}.pdf`;
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${outputFilename}"`,
                'Content-Length': pdfBuffer.length,
            });
            res.send(pdfBuffer);
        } catch (error) {
            console.error('Generation error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate PDF.' });
        } finally {
            for (const f of tempFiles) {
                try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { }
            }
        }
    });
});

module.exports = router;
