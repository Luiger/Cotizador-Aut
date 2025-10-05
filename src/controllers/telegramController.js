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
    // Llamamos a la función de polling por primera vez para iniciar el ciclo.
    pollUpdates(); 
};

// Función que consulta a la API de Telegram por nuevos mensajes
const pollUpdates = async () => {
    try {
        const { data } = await axios.get(`${TELEGRAM_API}/getUpdates`, {
            // timeout de 30 segundos, es un valor estándar para long polling.
            // La petición se mantendrá abierta hasta 30s si no hay mensajes.
            params: { offset: offset + 1, timeout: 30 } 
        });

        if (data.result.length > 0) {
            for (const update of data.result) {
                offset = update.update_id; // Actualizamos el offset
                // Procesamos cada mensaje de forma asíncrona pero sin esperar (no bloqueante)
                // para que el polling continúe rápidamente si llegan varios mensajes a la vez.
                processUpdate(update); 
            }
        }
    } catch (error) {
        if (error.response && error.response.status === 409) {
            // Este error ya no debería ocurrir, pero lo dejamos como seguridad.
            console.warn('Conflicto de polling detectado (409). Reiniciando ciclo.');
        } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            // Errores de red comunes en long polling, son normales.
            console.log('Timeout de polling o reseteo de conexión, reiniciando ciclo.');
        } else {
            // Errores inesperados
            console.error('Error grave en el polling de Telegram:', error.message);
            // Esperamos un poco antes de reintentar en caso de un error grave
            await new Promise(resolve => setTimeout(resolve, 5000)); 
        }
    } finally {
        // MUY IMPORTANTE:
        // Ya sea que la petición tuvo éxito o falló, llamamos a pollUpdates de nuevo
        // para crear un bucle infinito y robusto.
        pollUpdates();
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
**Duración Solicitada:** ${analisis_interno.duracion_texto}
---
**Subtotal:** $${subtotal.toFixed(2)} MXN
**IVA (16%):** $${iva.toFixed(2)} MXN
**Total:** **$${total.toFixed(2)} MXN**

*A continuación, generaré el PDF y agendaré la renta en nuestro calendario para las fechas solicitadas.*`;

            await telegramService.sendMessage(chatId, quoteText, 'Markdown');

            // Preparar el objeto de datos para los servicios de PDF y Calendario
            const quoteData = {
                machine: machine,
                duration: analisis_interno.duracion_texto,
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
            await telegramService.sendMessage(chatId, '🗓️ Agendando el período de renta en nuestro calendario...');
            // Pasamos las fechas que nos dio la IA
            const eventCreated = await calendarService.createRentalEvent(
                quoteData, 
                chatId, 
                analisis_interno.fecha_inicio, 
                analisis_interno.fecha_fin
            );

            if (eventCreated) {
                await telegramService.sendMessage(chatId, '✅ ¡Listo! Tu período de renta ha sido agendado tentativamente. ¡Gracias por tu interés!');
            } else {
                await telegramService.sendMessage(chatId, '✅ Tu cotización ha sido enviada. Tuvimos un problema al agendar las fechas en el calendario, pero un asesor se pondrá en contacto a la brevedad.');
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