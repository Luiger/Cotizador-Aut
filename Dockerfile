# --- Dockerfile para el Bot de Cotizaciones en Render ---

# 1. Usar la imagen oficial de Node.js 20 LTS (versión ligera).
FROM node:20-slim

# 2. Instalar ffmpeg en el sistema operativo del contenedor.
RUN apt-get update && apt-get install -y ffmpeg --no-install-recommends && rm -rf /var/lib/apt/lists/*

# 3. Establecer el directorio de trabajo para nuestra aplicación.
WORKDIR /usr/src/app

# 4. Copiar los archivos de dependencias.
COPY package*.json ./

# 5. Instalar las dependencias de npm.
RUN npm install

# 6. Copiar el resto del código de nuestra aplicación.
COPY . .

# 7. Definir el comando que se ejecutará cuando el contenedor se inicie.
CMD [ "node", "src/index.js" ]