const axios = require('axios');
const aiService = require('../services/aiService');
const telegramService = require('../services/telegramService');
const dbService = require('../services/dbService');
const pdfService = require('../services/pdfService');
const calendarService = require('../services/calendarService');
// GESTOR DE HISTORIAL DE CONVERSACIÓN
const conversationHistory = {};

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
let offset = 0; // Para llevar la cuenta de los mensajes ya procesados

// Función principal que inicia el ciclo de polling
const startBot = async () => {
    console.log('🤖 Bot escuchando actualizaciones de Telegram...');
    setInterval(pollUpdates, 3000); // Revisa si hay nuevos mensajes cada 3 segundos
};

// Función que consulta a la API de Telegram por nuevos mensajes
const pollUpdates = async () => {
    try {
        const { data } = await axios.get(`${TELEGRAM_API}/getUpdates`, {
            params: { offset: offset + 1, timeout: 2 } // timeout largo para long-polling
        });

        if (data.result.length > 0) {
            for (const update of data.result) {
                offset = update.update_id; // Actualizamos el offset
                await processUpdate(update); // Procesamos cada mensaje
            }
        }
    } catch (error) {
        console.error('Error en el polling de Telegram:', error.message);
    }
};

const processQuoteRequest = async (chatId, text) => {
    try {
        // OBTENER EL CATÁLOGO
        const catalog = await dbService.getFullCatalog();
        if (catalog.length === 0) {
            await telegramService.sendMessage(chatId, '⚠️ Lo siento, no puedo acceder a nuestro catálogo en este momento.');
            return;
        }

        // --- LÓGICA DE HISTORIAL ---
        // Recuperamos el historial para este chat o creamos uno nuevo si no existe.
        const userHistory = conversationHistory[chatId] || [];
        // Añadimos el último mensaje del usuario al historial.
        userHistory.push({ role: 'user', parts: [{ text }] });

        // OBTENER LA RESPUESTA DEL ASISTENTE (AHORA CON HISTORIAL)
        const assistantResponse = await aiService.getAssistantResponse(userHistory, catalog);
        
        const { analisis_interno, respuesta_usuario } = assistantResponse;
        
        // Añadimos la respuesta del asistente al historial para la próxima vez.
        userHistory.push({ role: 'model', parts: [{ text: respuesta_usuario }] });
        // Guardamos el historial actualizado.
        conversationHistory[chatId] = userHistory;

        // ENVIAR LA RESPUESTA AL USUARIO
        await telegramService.sendMessage(chatId, respuesta_usuario);

        // ACTUAR SEGÚN EL ANÁLISIS INTERNO QUE NOS DIO LA IA
        if (analisis_interno.accion === "COTIZAR") {
            // Si la acción es "COTIZAR", procedemos a buscar en la BD y calcular.
            // La IA ya nos dio el nombre exacto de la máquina, así que la búsqueda es confiable.
            const machine = await dbService.findMachineByName(analisis_interno.maquina);
            
            if (!machine) {
                // Este es un caso de seguridad, en caso de que la IA alucine un nombre de máquina.
                await telegramService.sendMessage(chatId, "Hmm, parece que hubo un error al encontrar los detalles de esa máquina en nuestro sistema. Permíteme verificar y un asesor se pondrá en contacto.");
                return;
            }

            // CÁLCULO DE LA COTIZACIÓN
            const subtotal = parseFloat(machine.precio_semana); // Aseguramos que sea un número
            const iva = subtotal * 0.16;
            const total = subtotal + iva;

            const quoteText = `
✅ ¡Aquí tienes el desglose de tu cotización!

**Máquina:** ${machine.nombre_modelo}
**Descripción:** ${machine.descripcion}
**Duración Solicitada:** ${analisis_interno.duracion}
---
**Subtotal:** $${subtotal.toFixed(2)} MXN
**IVA (16%):** $${iva.toFixed(2)} MXN
**Total:** **$${total.toFixed(2)} MXN**

*Este es un costo preliminar. En los siguientes pasos generaré el PDF y agendaré un recordatorio.*`;

            await telegramService.sendMessage(chatId, quoteText, 'Markdown');

            // Preparar el objeto de datos para los servicios de PDF y Calendario
            const quoteData = {
                machine: machine,
                duration: analisis_interno.duracion,
                subtotal: subtotal,
                iva: iva,
                total: total,
            };

            // Generar y enviar el PDF
            await telegramService.sendMessage(chatId, '📄 Generando tu cotización en formato PDF, un momento por favor...');
            try {
                const pdfBuffer = await pdfService.createQuotePdf(quoteData);
                await telegramService.sendDocument(chatId, pdfBuffer, 'Cotizacion_Maquinaria_Pro.pdf');
            } catch (pdfError) {
                console.error(`[Chat ID: ${chatId}] Error al generar o enviar el PDF:`, pdfError);
                await telegramService.sendMessage(chatId, 'Tuve un problema al generar el documento PDF, pero no te preocupes, un asesor ya tiene tus datos para el seguimiento.');
            }

            // Crear el evento en Google Calendar
            await telegramService.sendMessage(chatId, '🗓️ Agendando un recordatorio para nuestro equipo de ventas...');
            const eventCreated = await calendarService.createFollowUpEvent(quoteData, chatId);

            if (eventCreated) {
                await telegramService.sendMessage(chatId, '✅ ¡Listo! Tu cotización ha sido enviada en PDF y nuestro equipo ha sido notificado para darte el mejor seguimiento. ¡Gracias por tu interés!');
            } else {
                await telegramService.sendMessage(chatId, '✅ Tu cotización ha sido enviada. Tuvimos un problema al agendar el recordatorio, pero un asesor se pondrá en contacto a la brevedad.');
            }

        }

    } catch (error) {
        console.error(`Error grave en el flujo de cotización para el chat ${chatId}:`, error);
        await telegramService.sendMessage(chatId, '⚠️ Ups, ocurrió un error inesperado al procesar tu solicitud. Nuestro equipo técnico ha sido notificado.');
    }
};

// Función que decide qué hacer con cada mensaje (update)
const processUpdate = async (update) => {
    const message = update.message;
    if (!message || message.text?.startsWith('/')) return;
    const chatId = message.chat.id;

    try {
        let userText;
        if (message.voice) {
            console.log(`[Chat ID: ${chatId}] Recibido mensaje de voz.`);
            await telegramService.sendMessage(chatId, '🎙️ Transcribiendo tu audio...');
            const fileLink = await telegramService.getFileLink(message.voice.file_id);
            userText = await aiService.transcribeAudio(fileLink);
            await telegramService.sendMessage(chatId, `Texto transcrito: "_${userText}_"`, 'Markdown');
        } else if (message.text) {
            console.log(`[Chat ID: ${chatId}] Recibido mensaje de texto: "${message.text}"`);
            userText = message.text;
        }
        
        if (userText) {
            // Llamamos a nuestra nueva función de lógica de negocio
            await processQuoteRequest(chatId, userText);
        }

    } catch (error) {
        console.error(`Error procesando mensaje para el chat ${chatId}:`, error);
        await telegramService.sendMessage(chatId, 'Lo siento, no pude procesar tu mensaje. Por favor, intenta de nuevo.');
    }
};
module.exports = { startBot };