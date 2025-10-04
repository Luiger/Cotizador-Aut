const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuración de APIS
const WIT_API_URL = 'https://api.wit.ai/speech';
const WIT_SERVER_TOKEN = process.env.WIT_AI_SERVER_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- INICIALIZACIÓN DE CLIENTES ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY); // <-- NUEVO CLIENTE

/**
 * Convierte un stream de audio de entrada al formato WAV (PCM 16-bit, 16kHz, Mono),
 * que es ideal para la mayoría de las APIs de reconocimiento de voz.
 * @param {Stream} inputStream El stream de audio original (ej. de un archivo OGG).
 * @returns {Promise<Stream>} Una promesa que se resuelve con un nuevo stream de audio en formato WAV.
 */
const convertToWavStream = (inputStream) => {
    const outputStream = new PassThrough();
    
    return new Promise((resolve, reject) => {
        ffmpeg(inputStream)
            .toFormat('wav')
            .audioCodec('pcm_s16le') // Formato estándar PCM 16-bit Little-Endian
            .audioChannels(1)       // Canal único (Mono)
            .audioFrequency(16000)  // Frecuencia de muestreo de 16kHz
            .on('error', (err) => {
                console.error('Error durante la conversión con ffmpeg:', err.message);
                reject(err);
            })
            .pipe(outputStream);

        // Resolvemos la promesa inmediatamente con el stream de salida.
        // ffmpeg comenzará a escribir en él tan pronto como reciba datos.
        resolve(outputStream);
    });
};


/**
 * Descarga, convierte y transcribe un archivo de audio desde una URL.
 * @param {string} audioUrl - La URL directa para descargar el archivo de audio.
 * @returns {Promise<string>} El texto transcrito.
 */
const transcribeAudio = async (audioUrl) => {
    try {
        // 1. Descargar el audio de Telegram como un stream de entrada
        const audioInputResponse = await axios({
            method: 'get',
            url: audioUrl,
            responseType: 'stream'
        });

        // 2. Convertir el stream de OGG a WAV en memoria
        console.log('Convirtiendo audio a formato WAV...');
        const wavStream = await convertToWavStream(audioInputResponse.data);

        // 3. Enviar el stream WAV convertido a Wit.ai
        console.log('Enviando audio WAV a Wit.ai...');
        const witResponse = await axios({
            method: 'post',
            url: WIT_API_URL,
            data: wavStream,
            headers: {
                'Authorization': `Bearer ${WIT_SERVER_TOKEN}`,
                'Content-Type': 'audio/wav', // ¡IMPORTANTE! El Content-Type ahora es audio/wav
            }
        });

        // 4. Parseo robusto de la respuesta de Wit.ai
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

    const prompt = `
        Eres "Maquinaria Pro", un asistente de ventas virtual experto en alquiler de maquinaria. Eres amigable, profesional y vas directo al grano.

        **Reglas Fundamentales de Conversación:**
        1.  **Mantén el Contexto:** Tu respuesta DEBE basarse en el historial completo de la conversación. No te presentes de nuevo si ya lo hiciste. Responde directamente a la última pregunta del usuario.
        2.  **Sé Proactivo:** Si un usuario pide un listado o pregunta qué tienes, proporciónale la lista completa del catálogo que conoces.
        3.  **Tu ÚNICO Conocimiento:** Tu inventario se limita a esta lista. No inventes maquinaria.
            --- CATÁLOGO ---
            ${catalogString}
            --- FIN DEL CATÁLOGO ---

        **Tu Tarea:**
        Analiza el historial de la conversación y genera la siguiente respuesta. Tu salida debe ser SIEMPRE un único objeto JSON válido.
        El JSON debe tener dos claves: "analisis_interno" y "respuesta_usuario".

        1.  **analisis_interno**:
            -   "accion": Decide qué hacer. Valores: "COTIZAR", "ACLARAR", "CATALOGO_INCOMPLETO", "CONVERSACION_GENERAL".
            -   "maquina": Si aplica, el nombre exacto de la máquina del catálogo. Si no, null.
            -   "duracion": Si aplica, la duración del alquiler. Si no, null.

        2.  **respuesta_usuario**: El texto EXACTO y natural que el bot enviará al usuario. No debe incluir tu nombre ("Maquinaria Pro") a menos que sea la primera vez que hablas.

        Reglas para decidir la "accion" y generar la "respuesta_usuario":
        -   Si identificas claramente una máquina del catálogo **Y TAMBIÉN** una duración de alquiler, la "accion" es "COTIZAR". Si solo tienes uno de los dos, la acción DEBE ser "ACLARAR". La "respuesta_usuario" (para COTIZAR) debe ser un mensaje confirmando que tienes toda la información. Ej: "¡Excelente! Permíteme preparar la cotización para la Retroexcavadora CAT 416 por dos semanas."
        -   Si la petición es ambigua (ej. "quiero una plataforma") o falta la duración (ej. "el minicargador"), la "accion" es "ACLARAR". La "respuesta_usuario" debe ser una pregunta para obtener los datos faltantes. Ej: "¡Ok, el minicargador! ¿Por cuánto tiempo te gustaría rentarlo?"
        -   Si el usuario pide algo que no está en el catálogo, la "accion" es "CATALOGO_INCOMPLETO". La "respuesta_usuario" debe informarle amablemente y, si es posible, sugerir una alternativa. Ej: "Actualmente no manejamos tractores, pero contamos con retroexcavadoras y minicargadores que podrían servirte. ¿Te gustaría cotizar alguno de ellos?"
        -   Si el usuario solo saluda o hace una pregunta general, la "accion" es "SALUDO_GENERAL". La "respuesta_usuario" debe ser un saludo cordial que presente lo que puedes hacer. Ej: "¡Hola! Soy Maquinaria Pro, tu asistente virtual. Puedo ayudarte a cotizar la renta de nuestra maquinaria. ¿Qué equipo necesitas hoy?"

        Petición del usuario (el último mensaje del historial): "${history[history.length - 1].parts[0].text}"
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