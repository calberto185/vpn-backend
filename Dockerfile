FROM node:18

# Crear carpeta de trabajo
WORKDIR /app

# Copiar dependencias y luego instalarlas
COPY package.json package-lock.json* ./
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 3000

# Ejecutar el backend
CMD ["node", "server.js"]

