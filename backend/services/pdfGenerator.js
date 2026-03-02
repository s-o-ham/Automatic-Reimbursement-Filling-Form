const PDFDocument = require('pdfkit');
const fs = require('fs');
const sharp = require('sharp');

/**
 * Returns true if the image has meaningful content (not blank/white).
 */
async function isMeaningfulImage(imagePath) {
    if (!imagePath || !fs.existsSync(imagePath)) return false;
    try {
        const stats = await sharp(imagePath).grayscale().stats();
        const { mean, stdev } = stats.channels[0];
        // Blank page: very white (mean >245) AND very uniform (stdev <8)
        return !(mean > 245 && stdev < 8);
    } catch {
        return true; // include by default if we can't analyse
    }
}

/**
 * Generates the combined reimbursement PDF.
 *
 * @param {object} opts
 * @param {Array}  opts.bills  - Array of { filename, images: string[], date }
 *                               images[] = one PNG path per page of the uploaded file
 * @param {string} opts.docId  - Unique document UUID
 * @returns {Promise<Buffer>}
 */
async function generatePDF({ bills, docId }) {
    // For each bill, filter out blank pages from its images array
    const filteredBills = await Promise.all(
        bills.map(async (bill) => {
            const meaningful = [];
            for (const imgPath of bill.images) {
                if (await isMeaningfulImage(imgPath)) {
                    meaningful.push(imgPath);
                } else {
                    console.log(`  Skipping blank page in "${bill.filename}": ${imgPath}`);
                }
            }
            return { ...bill, images: meaningful.length > 0 ? meaningful : bill.images };
        })
    );

    // Count total output pages: 1 cover + (pages per bill)
    const totalContentPages = filteredBills.reduce((sum, b) => sum + b.images.length, 0);
    const totalPages = 1 + totalContentPages;

    return new Promise((resolve, reject) => {
        const buffers = [];

        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            autoFirstPage: false,
        });

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageW = 595.28;
        const pageH = 841.89;
        const marginL = 50;
        const marginR = 50;
        const usableW = pageW - marginL - marginR;

        // ── Cover / Summary Page ──────────────────────────────────────
        doc.addPage({ margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        drawHeader(doc, pageW, usableW);

        const billCount = filteredBills.length;

        drawPill(doc, marginL, 110, usableW, 'Bills Attached',
            `${billCount} file${billCount > 1 ? 's' : ''}  (${totalContentPages} page${totalContentPages > 1 ? 's' : ''} total)`,
            '#f0fdf4', '#86efac', '#15803d', '#14532d');

        // Contents table
        let listY = 170;
        doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(9)
            .text('CONTENTS', marginL, listY, { characterSpacing: 1.5 });
        listY += 16;

        filteredBills.forEach((bill, i) => {
            const rowH = 34;
            doc.roundedRect(marginL, listY, usableW, rowH, 6)
                .fillAndStroke(i % 2 === 0 ? '#f8fafc' : '#ffffff', '#e2e8f0');

            doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(10)
                .text(`${i + 1}`, marginL + 10, listY + 11);

            doc.fillColor('#1e293b').font('Helvetica').fontSize(10)
                .text(bill.filename, marginL + 28, listY + 11, { width: usableW - 180, ellipsis: true });

            doc.fillColor('#64748b').font('Helvetica').fontSize(9)
                .text(`${bill.images.length} pg`, marginL + usableW - 155, listY + 12, { width: 40, align: 'right' });

            doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(9)
                .text(formatDate(bill.date), marginL + usableW - 110, listY + 12, { width: 108, align: 'right' });

            listY += rowH + 2;
        });

        drawFooter(doc, pageW, usableW, docId, 1, totalPages);

        // ── Pages for each bill ───────────────────────────────────────
        let globalPageIdx = 2; // starts after cover

        filteredBills.forEach((bill, billIdx) => {
            bill.images.forEach((imgPath, pageIdx) => {
                // Full-bleed image page — maximise preview real estate
                doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });

                // Thin top strip (40px) for metadata
                const stripH = 46;
                doc.rect(0, 0, pageW, stripH).fill('#4f46e5');

                // Bill label
                doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
                    .text(`Bill ${billIdx + 1} of ${billCount}  |  ${bill.filename}`,
                        14, 8, { width: pageW * 0.55, ellipsis: true });

                // Date + page counter on the right
                const rightText = `${formatDate(bill.date)}   Page ${pageIdx + 1} / ${bill.images.length}`;
                doc.fillColor('rgba(255,255,255,0.85)').font('Helvetica').fontSize(9)
                    .text(rightText, pageW * 0.55, 10, { width: pageW * 0.4, align: 'right' });

                // Embed the page image filling the full remaining height
                const imgTop = stripH + 2;
                const imgH = pageH - imgTop - 22; // leave footer strip

                if (fs.existsSync(imgPath)) {
                    try {
                        doc.image(imgPath, 0, imgTop, {
                            fit: [pageW, imgH],
                            align: 'center',
                            valign: 'top',
                        });
                    } catch (e) {
                        console.warn(`Could not embed image (bill ${billIdx + 1}, page ${pageIdx + 1}):`, e.message);
                        doc.fillColor('#ef4444').font('Helvetica').fontSize(11)
                            .text('[Preview could not be loaded]', marginL, imgTop + 20,
                                { align: 'center', width: usableW });
                    }
                }

                // Thin footer strip
                const footerY = pageH - 20;
                doc.rect(0, footerY, pageW, 20).fill('#f1f5f9');
                doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
                    .text(`Doc ID: ${docId}  |  Page ${globalPageIdx} of ${totalPages}  |  ${new Date().toISOString()}`,
                        10, footerY + 6, { width: pageW - 20, align: 'center' });

                globalPageIdx++;
            });
        });

        doc.end();
    });
}

// ── Helpers ───────────────────────────────────────────────────────

function drawHeader(doc, pageW, usableW) {
    doc.rect(0, 0, pageW, 82).fill('#4f46e5');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
        .text('Reimbursement Bill', 50, 22, { align: 'center', width: usableW });
    doc.fillColor('rgba(255,255,255,0.65)').font('Helvetica').fontSize(10)
        .text('Generated automatically  |  Do not alter', 50, 50, { align: 'center', width: usableW });
}

function drawPill(doc, x, y, width, label, value, fillColor, strokeColor, labelColor, valueColor) {
    doc.roundedRect(x, y, width, 44, 8).fillAndStroke(fillColor, strokeColor);
    const labelText = `${label}:`;
    doc.fillColor(labelColor).font('Helvetica-Bold').fontSize(12).text(labelText, x + 14, y + 14);
    const labelW = doc.widthOfString(labelText) + 14 + 10;
    doc.fillColor(valueColor).font('Helvetica').fontSize(12)
        .text(value, x + labelW, y + 14, { width: width - labelW - 14, ellipsis: true });
}

function drawFooter(doc, pageW, usableW, docId, currentPage, totalPages) {
    const footerY = 841.89 - 38;
    doc.rect(0, footerY - 4, pageW, 42).fill('#f8fafc');
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
        .text(`Doc ID: ${docId}`, 50, footerY + 4, { align: 'left', width: usableW / 2 });
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
        .text(`Page ${currentPage} of ${totalPages}  |  ${new Date().toISOString()}`,
            50 + usableW / 2, footerY + 4, { align: 'right', width: usableW / 2 });
}

function formatDate(dateStr) {
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

module.exports = { generatePDF };
