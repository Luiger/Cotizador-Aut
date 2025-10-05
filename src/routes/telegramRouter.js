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
        // req.protocol nos da 'http' o 'https'.
        // req.get('host') nos da el dominio de nuestro servidor (ej. bot-cotizador-pro.onrender.com).
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        // Construimos la URL completa de nuestro webhook.
        // Usamos process.env.TELEGRAM_BOT_TOKEN como parte de la ruta para hacerla "secreta".
        const webhookUrl = `${baseUrl}/telegram/webhook`;

        // Llamamos a nuestra API para registrar la URL en Telegram.
        const result = await telegramApi.setWebhook(webhookUrl);

        if (result.success) {
            res.status(200).send(`¡Webhook configurado exitosamente! URL: ${webhookUrl}`);
        } else {
            res.status(500).send(`Error al configurar el webhook: ${result.error}`);
        }
    } catch (error) {
        console.error("Error crítico en /setWebhook:", error.message);
        res.status(500).send("Error interno del servidor al intentar configurar el webhook.");
    }
});

module.exports = router;