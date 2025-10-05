require('dotenv').config();

const express = require('express');
const telegramRouter = require('./routes/telegramRouter'); 

const app = express();

const PORT = process.env.PORT || 3000;

// Aplicar middleware esencial.
// express.json() permite que nuestro servidor entienda las peticiones que vienen
// en formato JSON, que es como Telegram envía las actualizaciones del webhook.
app.use(express.json());

//Definir una ruta raíz de prueba.
// Esto es útil para verificar rápidamente que el servidor está vivo y respondiendo.
// Simplemente visita la URL base de tu servicio en el navegador.
app.get('/', (req, res) => {
    res.status(200).send('¡El asistente de cotizaciones está vivo y escuchando!');
});

// Conectar (o "montar") nuestro router de Telegram.
// Le decimos a Express: "Cualquier petición que llegue a la ruta '/telegram'
// debe ser manejada por el telegramRouter".
app.use('/telegram', telegramRouter);

// Iniciar el servidor.
// La aplicación empieza a escuchar peticiones en el puerto especificado.
app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    console.log('El bot está listo para recibir actualizaciones vía webhook.');
    console.log('Si es la primera vez que despliegas, no olvides visitar la ruta /telegram/setWebhook para registrar tu bot.');
});