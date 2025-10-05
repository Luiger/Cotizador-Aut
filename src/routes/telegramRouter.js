const express = require('express');
const telegramApi = require('../services/telegramApi'); // Importamos nuestra nueva capa de API
const { processUpdate } = require('../controllers/telegramController'); // Importamos el cerebro del bot

// Creamos una nueva instancia del router de Express
const router = express.Router();

/**
 * RUTA 1: POST /webhook
 * Esta es la URL que Telegram usará para enviarnos actualizaciones (mensajes de usuarios).
 * La ruta completa será /telegram/webhook porque la montaremos bajo /telegram en index.js.
 */
router.post('/webhook', async (req, res) => {
    const update = req.body;
    console.log('Webhook recibido:', JSON.stringify(update, null, 2));

    // Llamamos a la lógica principal del bot para que procese el mensaje.
    // No esperamos a que termine (no usamos await) para poder responder a Telegram rápidamente.
    processUpdate(update);

    // Respondemos inmediatamente a Telegram con un status 200 OK.
    // Esto es crucial. Si no respondemos, Telegram pensará que nuestro servidor falló
    // y seguirá reenviando el mismo mensaje.
    res.sendStatus(200);
});

/**
 * RUTA 2: GET /setWebhook
 * Esta es una ruta de utilidad que nosotros (los desarrolladores) visitaremos
 * UNA SOLA VEZ en el navegador para configurar el webhook después de desplegar.
 * La ruta completa será /telegram/setWebhook.
 */
router.get('/setWebhook', async (req, res) => {
    try {
        const baseUrl = `https://${req.get('host')}`; 
        const url = `${baseUrl}/telegram/webhook`;
        const response = await require('axios').get(`https://api.telegram.org/bot${config.telegram.apiKey}/setWebhook?url=${url}`);
        console.log('Webhook configurado en:', url);
        res.send(response.data);
    } catch (error) {
        console.error("Error al configurar el webhook:", error.response?.data || error.message);
        res.status(500).send(error.response?.data || { message: "Error interno" });
    }
});

module.exports = router;