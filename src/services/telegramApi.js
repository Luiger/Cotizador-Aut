const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');

// Construimos la URL base de la API usando la variable de entorno
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Registra la URL de nuestro webhook con la API de Telegram.
 * Esta función será llamada por nuestro router una única vez.
 * @param {string} webhookUrl La URL completa y pública donde escucharemos las actualizaciones.
 */
const setWebhook = async (webhookUrl) => {
    try {
        console.log(`Configurando webhook en la URL: ${webhookUrl}`);
        const { data } = await axios.get(`${TELEGRAM_API_URL}/setWebhook`, {
            params: { url: webhookUrl }
        });

        if (data.ok) {
            console.log('✅ Webhook configurado exitosamente en Telegram.');
            return { success: true, data: data.result };
        } else {
            console.error('Error al configurar el webhook:', data.description);
            return { success: false, error: data.description };
        }
    } catch (error) {
        const errorMessage = error.response?.data?.description || error.message;
        console.error('Fallo catastrófico al configurar el webhook:', errorMessage);
        return { success: false, error: errorMessage };
    }
};

/**
 * Envía un mensaje de texto a un chat de Telegram.
 * @param {number} chatId El ID del chat de destino.
 * @param {string} text El texto del mensaje a enviar.
 * @param {string} [parseMode] Opcional. 'Markdown' o 'HTML' para formatear el texto.
 */
const sendMessage = async (chatId, text, parseMode) => {
    try {
        await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: parseMode
        });
    } catch (error) {
        console.error(`Error al enviar mensaje al chat ${chatId}:`, error.response?.data || error.message);
    }
};

/**
 * Envía un documento (como un PDF) a un chat de Telegram.
 * @param {number} chatId El ID del chat de destino.
 * @param {Buffer} buffer El buffer de datos del archivo.
 * @param {string} fileName El nombre que tendrá el archivo en Telegram.
 */
const sendDocument = async (chatId, buffer, fileName) => {
    try {
        const form = new FormData();
        const stream = Readable.from(buffer);
        
        form.append('chat_id', chatId.toString());
        form.append('document', stream, { filename: fileName });

        await axios.post(`${TELEGRAM_API_URL}/sendDocument`, form, {
            headers: form.getHeaders(),
        });
    } catch (error) {
        console.error(`Error al enviar documento al chat ${chatId}:`, error.response?.data || error.message);
    }
};

/**
 * Obtiene la ruta de un archivo para poder descargarlo.
 * @param {string} fileId El ID del archivo proporcionado por Telegram.
 * @returns {string|null} La URL completa para descargar el archivo, o null si falla.
 */
const getFileLink = async (fileId) => {
    try {
        const { data } = await axios.get(`${TELEGRAM_API_URL}/getFile`, {
            params: { file_id: fileId }
        });

        if (!data.ok || !data.result.file_path) {
            throw new Error('No se pudo obtener la ruta del archivo de Telegram.');
        }

        const filePath = data.result.file_path;
        return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
    } catch (error) {
        console.error('Error al obtener el link del archivo de Telegram:', error.response?.data || error.message);
        return null; // Devolvemos null en caso de error para un manejo más seguro
    }
};

/**
 * Envía una acción de chat (ej. 'typing') para dar feedback al usuario.
 * @param {number} chatId El ID del chat.
 * @param {string} action La acción a enviar. Por defecto, 'typing'.
 */
const sendChatAction = async (chatId, action = 'typing') => {
    try {
        await axios.post(`${TELEGRAM_API_URL}/sendChatAction`, {
            chat_id: chatId,
            action: action,
        });
    } catch (error) {
        // No es crítico si esto falla, así que solo lo logueamos
        console.warn(`Advertencia: No se pudo enviar la acción de chat al chat ${chatId}:`, error.message);
    }
};


module.exports = {
    setWebhook,
    sendMessage,
    sendDocument,
    getFileLink,
    sendChatAction
};