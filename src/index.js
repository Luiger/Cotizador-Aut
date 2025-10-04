// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

// Importa la función que inicia el bot
const { startBot } = require('./controllers/telegramController');

// Muestra un mensaje en la consola para confirmar que el proceso ha comenzado
console.log('Iniciando el bot de cotizaciones...');

// Llama a la función para que el bot empiece a escuchar mensajes
startBot();