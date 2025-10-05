const aiService = require('../services/aiService');
const telegramApi = require('../services/telegramApi'); 
const dbService = require('../services/dbService');
const pdfService = require('../services/pdfService');
const calendarService = require('../services/calendarService');

// El gestor de historial de conversación se mantiene, es parte de la lógica del bot.
const conversationHistory = {};

/**
 * Función que contiene la lógica principal para procesar una cotización.
 * Es llamada por processUpdate cuando se recibe un mensaje de texto o voz.
 * @param {number} chatId El ID del chat.
 * @param {string} text El texto del usuario (original o transcrito).
 */
const processQuoteRequest = async (chatId, text) => {
    try {
        const catalog = await dbService.getFullCatalog();
        if (catalog.length === 0) {
            await telegramApi.sendMessage(chatId, '⚠️ Lo siento, no puedo acceder a nuestro catálogo en este momento.');
            return;
        }

        const userHistory = conversationHistory[chatId] || [];
        userHistory.push({ role: 'user', parts: [{ text }] });

        const assistantResponse = await aiService.getAssistantResponse(userHistory, catalog);
        const { analisis_interno, respuesta_usuario } = assistantResponse;

        userHistory.push({ role: 'model', parts: [{ text: respuesta_usuario }] });
        conversationHistory[chatId] = userHistory;

        await telegramApi.sendMessage(chatId, respuesta_usuario);

        if (analisis_interno.accion === "COTIZAR") {
            const machine = await dbService.findMachineByName(analisis_interno.maquina);
            if (!machine) {
                await telegramApi.sendMessage(chatId, "Hubo un error al buscar los detalles de la máquina. Un asesor se pondrá en contacto.");
                return;
            }

            const subtotal = parseFloat(machine.precio_semana);
            const iva = subtotal * 0.16;
            const total = subtotal + iva;

            const quoteText = `
✅ ¡Aquí tienes el desglose de tu cotización!

**Máquina:** ${machine.nombre_modelo}
**Descripción:** ${machine.descripcion}
**Duración Solicitada:** ${analisis_interno.duracion_texto}
---
**Subtotal:** $${subtotal.toFixed(2)} MXN
**IVA (16%):** $${iva.toFixed(2)} MXN
**Total:** **$${total.toFixed(2)} MXN**

*Este es un costo preliminar. A continuación, generaré el PDF formal y agendaré el fin de la renta en nuestro calendario.*`;

            await telegramApi.sendMessage(chatId, quoteText, 'Markdown');
            
            const quoteData = {
                machine: machine,
                duration_texto: analisis_interno.duracion_texto,
                total: total,
            };

            await telegramApi.sendMessage(chatId, '📄 Generando tu cotización en formato PDF, un momento por favor...');
            try {
                const pdfBuffer = await pdfService.createQuotePdf(quoteData);
                await telegramApi.sendDocument(chatId, pdfBuffer, 'Cotizacion_Maquinaria_Pro.pdf');
            } catch (pdfError) {
                console.error(`[Chat ID: ${chatId}] Error al generar o enviar el PDF:`, pdfError);
                await telegramApi.sendMessage(chatId, 'Tuve un problema al generar el documento PDF, pero un asesor tiene tus datos.');
            }

            await telegramApi.sendMessage(chatId, '🗓️ Agendando el recordatorio en nuestro calendario...');
            const eventCreated = await calendarService.createRentalEvent(
                quoteData,
                chatId,
                analisis_interno.fecha_inicio,
                analisis_interno.fecha_fin
            );

            if (eventCreated) {
                await telegramApi.sendMessage(chatId, '✅ ¡Listo! Tu cotización ha sido enviada en PDF y hemos agendado el recordatorio. ¡Gracias por tu interés!');
            } else {
                await telegramApi.sendMessage(chatId, '✅ Tu cotización ha sido enviada. Tuvimos un problema al agendar el recordatorio, pero un asesor se pondrá en contacto a la brevedad.');
            }
        }
    } catch (error) {
        console.error(`Error grave en el flujo de cotización para el chat ${chatId}:`, error);
        await telegramApi.sendMessage(chatId, '⚠️ Ups, ocurrió un error inesperado al procesar tu solicitud. Nuestro equipo técnico ha sido notificado.');
    }
};

/**
 * Función principal que recibe una actualización de Telegram y decide qué hacer.
 * Es la única función que el router necesita llamar.
 * @param {object} update El objeto de actualización completo de Telegram.
 */
const processUpdate = async (update) => {
    const message = update.message;
    if (!message || message.text?.startsWith('/')) {
        return; // Ignoramos actualizaciones sin mensaje o que son comandos
    }
    
    const chatId = message.chat.id;

    try {
        let userText;
        if (message.voice) {
            console.log(`[Chat ID: ${chatId}] Recibido mensaje de voz.`);
            await telegramApi.sendMessage(chatId, '🎙️ Transcribiendo tu audio...');
            const fileLink = await telegramApi.getFileLink(message.voice.file_id);
            if (!fileLink) {
                throw new Error("No se pudo obtener el link del archivo de voz.");
            }
            userText = await aiService.transcribeAudio(fileLink);
            await telegramApi.sendMessage(chatId, `Texto transcrito: "_${userText}_"`, 'Markdown');
        } else if (message.text) {
            console.log(`[Chat ID: ${chatId}] Recibido mensaje de texto: "${message.text}"`);
            userText = message.text;
        }
        
        if (userText) {
            await processQuoteRequest(chatId, userText);
        }
    } catch (error) {
        console.error(`Error procesando mensaje para el chat ${chatId}:`, error);
        await telegramApi.sendMessage(chatId, 'Lo siento, no pude procesar tu mensaje. Por favor, intenta de nuevo.');
    }
};

module.exports = {
    processUpdate
};