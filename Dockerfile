# --- Dockerfile para el Bot de Cotizaciones en Render ---

# 1. Usar una imagen oficial de Node.js como base.
# 'slim' es una versión ligera, ideal para producción.
FROM node:18-slim

# 2. Instalar ffmpeg en el sistema operativo del contenedor.
# El comando RUN se ejecuta como administrador DENTRO del contenedor, donde sí tenemos permisos.
RUN apt-get update && apt-get install -y ffmpeg

# 3. Establecer el directorio de trabajo para nuestra aplicación.
WORKDIR /usr/src/app

# 4. Copiar los archivos de dependencias para optimizar el cache de Docker.
# Si estos archivos no cambian, Docker no volverá a ejecutar npm install.
COPY package*.json ./

# 5. Instalar las dependencias de npm.
RUN npm install

# 6. Copiar el resto del código de nuestra aplicación.
COPY . .

# 7. Definir el comando que se ejecutará cuando el contenedor se inicie.
CMD [ "node", "src/index.js" ]