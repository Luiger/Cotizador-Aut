const { google } = require('googleapis');
const fs = require('fs'); // Necesitamos 'fs' para leer el archivo JSON
const path = require('path');

/**
 * Crea un único evento de "todo el día" en Google Calendar en la fecha de
 * finalización de la renta, sirviendo como un recordatorio.
 * @param {object} quoteData - Datos de la cotización.
 * @param {string} clientChatId - El ID del chat del cliente.
 * @param {string} startDateStr - La fecha de inicio en formato 'YYYY-MM-DD'.
 * @param {string} endDateStr - La fecha de fin en formato 'YYYY-MM-DD'.
 */
const createRentalEvent = async (quoteData, clientChatId, startDateStr, endDateStr) => {
    try {     
        const keyFilePath = process.env.SERVICE_ACCOUNT_JSON_FILE_PATH;           
        if (!keyFilePath) {
            throw new Error('La variable de entorno SERVICE_ACCOUNT_JSON_FILE_PATH no está definida.');
        }

        // Leemos el contenido del archivo de credenciales.
        const credentials = JSON.parse(fs.readFileSync(path.resolve(keyFilePath), 'utf8'));

        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        const calendar = google.calendar({ version: 'v3', auth });
        
        // Si no tenemos fechas, no podemos crear el evento.
        if (!startDateStr || !endDateStr) {
            console.error(`[Chat ID: ${clientChatId}] No se proporcionaron fechas válidas para crear el evento.`);
            return false;
        }

        // Para un evento de un solo día, la fecha de inicio es el día que finaliza la renta.
        const eventStartDate = endDateStr;
        
        // Y la fecha de fin del evento, según la API, debe ser el día siguiente.
        const endDateObject = new Date(endDateStr);
        endDateObject.setDate(endDateObject.getDate() + 1);
        const eventEndDate = endDateObject.toISOString().slice(0, 10);

        const event = {
            summary: `FIN DE RENTA: ${quoteData.machine.nombre_modelo}`,
            description: `
    Este día finaliza el período de renta. Coordinar recolección del equipo.

    **Cliente (Chat ID):** ${clientChatId}
    **Equipo:** ${quoteData.machine.nombre_modelo}
    **Fecha de Inicio de Renta:** ${startDateStr}
    **Fecha de Fin de Renta:** ${endDateStr}
    **Monto Total:** $${quoteData.total.toFixed(2)} MXN
            `,
            start: {
                date: eventStartDate, // El día en que termina
                timeZone: 'America/Caracas', // Ajusta a tu zona horaria
            },
            end: {
                date: eventEndDate, // El día siguiente, para que dure todo el día
                timeZone: 'America/Caracas', // Ajusta a tu zona horaria
            },
            colorId: '2', // ID de color para "Verde" (tarea/recordatorio)
        };

        const response = await calendar.events.insert({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            resource: event,
        });

        console.log(`[Chat ID: ${clientChatId}] Evento de renta creado: ${response.data.htmlLink}`);
        return true;

    } catch (error) {
        console.error(`[Chat ID: ${clientChatId}] Error al crear evento de renta en Google Calendar:`, error.message);
        return false;
    }
};

module.exports = { createRentalEvent };