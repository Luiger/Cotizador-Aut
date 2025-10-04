const { google } = require('googleapis');
const keyFilePath = process.env.SERVICE_ACCOUNT_JSON_FILE_PATH;

/**
 * Crea un evento en Google Calendar para dar seguimiento a una cotización.
 * @param {object} quoteData - Datos de la cotización (máquina, cliente, total, etc.).
 * @param {string} clientChatId - El ID del chat del cliente en Telegram.
 */
const createFollowUpEvent = async (quoteData, clientChatId) => {
    try {        
        if (!keyFilePath) {
            throw new Error('La variable de entorno SERVICE_ACCOUNT_JSON_FILE_PATH no está definida.');
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyFilePath, // Usamos la ruta del .env
            scopes: 'https://www.googleapis.com/auth/calendar',
        });

        const calendar = google.calendar({ version: 'v3', auth });
        
        // Creamos un evento para dentro de 10 minutos
        const eventStartTime = new Date();
        eventStartTime.setMinutes(eventStartTime.getMinutes() + 10);
        const eventEndTime = new Date(eventStartTime.getTime());
        eventEndTime.setMinutes(eventStartTime.getMinutes() + 30); // Duración de 30 min

        const event = {
            summary: `Seguimiento Cotización: ${quoteData.machine.nombre_modelo}`,
            description: `
Dar seguimiento a la cotización enviada al cliente.

**Cliente (Chat ID):** ${clientChatId}
**Equipo Cotizado:** ${quoteData.machine.nombre_modelo}
**Duración:** ${quoteData.duration}
**Monto Total:** $${quoteData.total.toFixed(2)} MXN
            `,
            start: {
                dateTime: eventStartTime.toISOString(),
                timeZone: 'America/Caracas', // ¡IMPORTANTE! Ajusta a tu zona horaria
            },
            end: {
                dateTime: eventEndTime.toISOString(),
                timeZone: 'America/Caracas', // ¡IMPORTANTE! Ajusta a tu zona horaria
            },
            colorId: '5', // ID de color para "Amarillo" en Google Calendar
        };

        const response = await calendar.events.insert({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            resource: event,
        });

        console.log(`[Chat ID: ${clientChatId}] Evento de seguimiento creado: ${response.data.htmlLink}`);
        return true; // Éxito

    } catch (error) {
        console.error(`[Chat ID: ${clientChatId}] Error al crear evento en Google Calendar:`, error.message);
        return false; // Fallo
    }
};

module.exports = { createFollowUpEvent };