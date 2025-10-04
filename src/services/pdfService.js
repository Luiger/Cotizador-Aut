const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Crea un PDF de cotización con los datos proporcionados.
 * @param {object} quoteData - Un objeto con toda la información de la cotización.
 * @returns {Promise<Buffer>} Un buffer de datos con el PDF generado, listo para ser enviado.
 */
const createQuotePdf = async (quoteData) => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // Tamaño A4
    const { width, height } = page.getSize();
    
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // --- Título y Encabezado ---
    page.drawText('COTIZACIÓN DE RENTA DE MAQUINARIA', {
        x: 60,
        y: height - 80,
        font: helveticaBoldFont,
        size: 18,
        color: rgb(0.1, 0.1, 0.1),
    });

    const today = new Date().toLocaleDateString('es-ES');
    page.drawText(`Fecha: ${today}`, {
        x: width - 150,
        y: height - 80,
        font: helveticaFont,
        size: 12,
    });

    // --- Línea divisoria ---
    page.drawLine({
        start: { x: 60, y: height - 100 },
        end: { x: width - 60, y: height - 100 },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
    });
    
    // --- Detalles de la Maquinaria ---
    let yPosition = height - 140;
    
    const drawLine = (label, value, isBold = false) => {
    // Si 'value' es null o undefined, lo convertimos en un string 'N/A' (No Aplica)
    const textValue = value ?? 'N/A'; 
    page.drawText(label, { x: 70, y: yPosition, font: isBold ? helveticaBoldFont : helveticaFont, size: 12 });
    page.drawText(textValue, { x: 250, y: yPosition, font: helveticaFont, size: 12 });
    yPosition -= 25;
    };

    // Detalles de la máquina
    drawLine('Equipo:', quoteData.machine.nombre_modelo, true);
    drawLine('Descripción:', quoteData.machine.descripcion);
    drawLine('Duración Solicitada:', quoteData.duration);
    
    yPosition -= 20; // Espacio antes de los costos

    // --- Desglose de Costos ---
    drawLine('Subtotal:', `$${quoteData.subtotal.toFixed(2)} MXN`);
    drawLine('IVA (16%):', `$${quoteData.iva.toFixed(2)} MXN`);
    
    // Línea divisoria para el total
    page.drawLine({
        start: { x: 240, y: yPosition + 15 },
        end: { x: width - 250, y: yPosition + 15 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5),
    });

    // Total
    page.drawText('Total a Pagar:', { x: 70, y: yPosition, font: helveticaBoldFont, size: 14 });
    page.drawText(`$${quoteData.total.toFixed(2)} MXN`, { x: 250, y: yPosition, font: helveticaBoldFont, size: 14, color: rgb(0, 0.5, 0.1) });

    yPosition -= 50;
    
    // --- Pie de Página ---
    page.drawText('Esta cotización es preliminar y está sujeta a la confirmación de disponibilidad del equipo.', {
        x: 60,
        y: yPosition,
        font: helveticaFont,
        size: 9,
        color: rgb(0.5, 0.5, 0.5),
    });

    // Guardar el PDF en un buffer de bytes
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
};

module.exports = { createQuotePdf };