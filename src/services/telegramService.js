const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Obtiene la ruta de un archivo para poder descargarlo.
 * @param {string} fileId - El ID del archivo proporcionado por Telegram.
 * @returns {string} La URL completa para descargar el archivo.
 */
const getFileLink = async (fileId) => {
    try {
        const { data } = await axios.get(`${TELEGRAM_API}/getFile`, {
            params: { file_id: fileId }
        });

        if (!data.ok || !data.result.file_path) {
            throw new Error('No se pudo obtener la ruta del archivo de Telegram.');
        }

        const filePath = data.result.file_path;
        return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    } catch (error) {
        console.error('Error al obtener el link del archivo de Telegram:', error);
        throw error; // Re-lanzamos el error para que el controlador lo capture
    }
};

/**
 * Envía un mensaje de texto a un chat de Telegram.
 * @param {number} chatId - El ID del chat de destino.
 * @param {string} text - El texto del mensaje a enviar.
 * @param {string} [parseMode] - Opcional. 'Markdown' o 'HTML' para formatear el texto.
 */
const sendMessage = async (chatId, text, parseMode) => {
    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: parseMode // Se añade si se proporciona
        });
    } catch (error) {
        console.error(`Error al enviar mensaje al chat ${chatId}:`, error.message);
    }
};

/**
 * Envía un documento (como un PDF) a un chat de Telegram.
 * @param {number} chatId - El ID del chat de destino.
 * @param {Buffer} buffer - El buffer de datos del archivo.
 * @param {string} fileName - El nombre que tendrá el archivo en Telegram.
 */
const sendDocument = async (chatId, buffer, fileName) => {
    try {
        const form = new FormData();
        const stream = Readable.from(buffer);
        
        form.append('chat_id', chatId.toString());
        form.append('document', stream, { filename: fileName });

        await axios.post(`${TELEGRAM_API}/sendDocument`, form, {
            headers: form.getHeaders(),
        });
    } catch (error) {
        console.error(`Error al enviar documento al chat ${chatId}:`, error.message);
    }
};

module.exports = { 
    getFileLink,
    sendMessage,
    sendDocument
};