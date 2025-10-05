const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { Writable } = require('stream');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuración de APIS
const WIT_API_URL = 'https://api.wit.ai/speech';
const WIT_SERVER_TOKEN = process.env.WIT_AI_SERVER_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- INICIALIZACIÓN DE CLIENTES ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY); // <-- NUEVO CLIENTE

/**
 * Convierte un stream de audio a un Buffer en formato WAV.
 * @param {Stream} inputStream El stream de audio original.
 * @returns {Promise<Buffer>} Una promesa que se resuelve con un Buffer de audio WAV.
 */
const convertToWavBuffer = (inputStream) => {
    const chunks = [];
    return new Promise((resolve, reject) => {
        // Creamos un stream de escritura en memoria
        const writableStream = new Writable({
            write(chunk, encoding, callback) {
                chunks.push(chunk);
                callback();
            }
        });

        ffmpeg(inputStream)
            .toFormat('wav')
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(16000)
            .on('error', (err) => reject(err))
            .pipe(writableStream)
            .on('finish', () => {
                // Una vez que ffmpeg termina, unimos todos los trozos en un solo Buffer
                resolve(Buffer.concat(chunks));
            });
    });
};


/**
 * Descarga, convierte y transcribe un archivo de audio desde una URL.
 * @param {string} audioUrl - La URL directa para descargar el archivo de audio.
 * @returns {Promise<string>} El texto transcrito.
 */
const transcribeAudio = async (audioUrl) => {
    try {
        // Descargar el audio de Telegram como un stream de entrada
        const audioInputResponse = await axios({
            method: 'get',
            url: audioUrl,
            responseType: 'stream'
        });

        // Convertir el stream de OGG a WAV en memoria
        console.log('Convirtiendo audio a formato WAV (Buffer)...');
        const wavBuffer = await convertToWavBuffer(audioInputResponse.data);

        // Enviar el Buffer WAV a Wit.ai
        console.log(`Enviando Buffer de audio (${wavBuffer.length} bytes) a Wit.ai...`);
        const witResponse = await axios({
            method: 'post',
            url: WIT_API_URL,
            data: wavBuffer, // Enviamos el Buffer completo
            headers: {
                'Authorization': `Bearer ${WIT_SERVER_TOKEN}`,
                'Content-Type': 'audio/wav',
                'Content-Length': wavBuffer.length // Axios suele añadir esto, pero ser explícitos ayuda
            }
        });

        // Parseo robusto de la respuesta de Wit.ai
        const responseText = witResponse.data;
        if (typeof responseText !== 'string' || responseText.length === 0) {
            throw new Error('La respuesta de Wit.ai está vacía o no es un texto.');
        }
        
        const lines = responseText.trim().split('\r\n');
        let transcription = null;

        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                const result = JSON.parse(lines[i]);
                if (result && typeof result.text === 'string' && result.text.length > 0) {
                    transcription = result.text;
                    break;
                }
            } catch (e) { /* Ignorar líneas no JSON */ }
        }

        if (transcription === null) {
            throw new Error('Wit.ai no devolvió una transcripción válida en su respuesta.');
        }

        return transcription;

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error('Error en el flujo de transcripción:', errorMessage);
        throw new Error('Fallo al transcribir el audio.');
    }
};

/**
 * Actúa como un asistente de ventas, analiza la petición del usuario
 * y devuelve tanto un plan de acción para el código como una respuesta para el usuario.
 * @param {string} userText - El texto del usuario.
 * @param {Array<object>} catalog - El catálogo de maquinaria disponible.
 * @returns {Promise<object>} Un objeto JSON con el análisis interno y la respuesta para el usuario.
 */
const getAssistantResponse = async (history, catalog) => {
    const catalogString = catalog.map(m => `- ${m.nombre_modelo}`).join('\n');
    const today = new Date().toISOString().slice(0, 10); // Obtenemos la fecha de hoy como YYYY-MM-DD

    const prompt = `
        Eres "Maquinaria Pro", un asistente de ventas virtual experto en alquiler de maquinaria. Tu personalidad es amigable, profesional y muy eficiente.
        La fecha de hoy es ${today}. Todas las fechas relativas deben calcularse a partir de hoy.

        **Tu Conocimiento del Inventario:**
        --- CATÁLOGO ---
        ${catalogString}
        --- FIN DEL CATÁLOGO ---

        **Tu Tarea:**
        Analiza el historial de la conversación y devuelve SIEMPRE un único objeto JSON válido.
        El JSON debe tener "analisis_interno" y "respuesta_usuario".

        1.  **analisis_interno**: Contiene tu análisis para que el sistema actúe.
            -   "accion": Valores: "COTIZAR", "ACLARAR", "CATALOGO_INCOMPLETO", "CONVERSACION_GENERAL".
            -   "maquina": El nombre exacto de la máquina del catálogo, o null.
            -   "duracion_texto": El texto original de la duración (ej. "dos semanas"), o null.
            -   "fecha_inicio": **La fecha de inicio calculada en formato YYYY-MM-DD**, o null.
            -   "fecha_fin": **La fecha de fin calculada en formato YYYY-MM-DD**, o null.

        2.  **respuesta_usuario**: El texto EXACTO y amigable que el bot enviará al usuario.

        **Reglas para Calcular Fechas y Decidir la Acción:**
        -   La acción SÓLO puede ser "COTIZAR" si has identificado una **máquina** Y una **duración**.
        -   Si el usuario dice "por dos semanas", y hoy es 2023-10-04, entonces 'fecha_inicio' es '2023-10-04' y 'fecha_fin' es '2023-10-18'.
        -   Si el usuario dice "para el próximo martes", y hoy es Lunes 2023-10-09, 'fecha_inicio' es '2023-10-17'. Si no especifica duración, asume 1 día y 'fecha_fin' es la misma que 'fecha_inicio'.
        -   Si el usuario dice "del 15 al 20 de noviembre", 'fecha_inicio' es '2023-11-15' y 'fecha_fin' es '2023-11-20'.
        -   Si falta la máquina o la duración, la acción es "ACLARAR" y las fechas son null.
        -   Si el usuario pide algo que no está en el catálogo, la acción es "CATALOGO_INCOMPLETO".
        -   Si el usuario solo saluda, la acción es "SALUDO_GENERAL".

        **Historial de Conversación:**
        ${JSON.stringify(history)}
    `;

    // Pasamos el historial completo al modelo
    // La API de Gemini está diseñada para recibir el historial en este formato
    const modelWithHistory = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const chat = modelWithHistory.startChat({
        history: [
            { role: 'user', parts: [{ text: prompt }] },
            { role: 'model', parts: [{ text: 'Entendido. Estoy listo para actuar como el asistente "Maquinaria Pro" y seguir todas las reglas.' }] },
            ...history // <-- Aquí insertamos el historial real de la conversación
        ],
    });

    try {
        const lastMessage = history[history.length - 1].parts[0].text;
        const result = await chat.sendMessage(lastMessage); // Enviamos solo el último mensaje, pero el chat ya tiene el contexto
        const responseText = result.response.text();
        
        // Lógica de limpieza robusta (la que ya implementamos)
        const jsonStartIndex = responseText.indexOf('{');
        const jsonEndIndex = responseText.lastIndexOf('}') + 1;
        if (jsonStartIndex === -1 || jsonEndIndex === 0) {
            console.error("Respuesta de Gemini sin JSON:", responseText);
            throw new Error("No se encontró un objeto JSON en la respuesta de Gemini.");
        }
        const jsonString = responseText.substring(jsonStartIndex, jsonEndIndex);
        return JSON.parse(jsonString);

    } catch (error) {
        console.error('Error al analizar con Gemini:', error);
        // Devolvemos una respuesta de error genérica pero segura
        return {
            analisis_interno: { accion: 'ERROR' },
            respuesta_usuario: 'Lo siento, estoy teniendo problemas para procesar tu solicitud en este momento. Por favor, intenta de nuevo más tarde.'
        };
    }
};

module.exports = { 
    transcribeAudio,
    getAssistantResponse
};