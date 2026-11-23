# Image pour mettre Carte produit en ligne. Les réglages (mot de passe, clé de l'IA) se donnent
# à l'hébergeur, jamais ici. Le dossier /data doit être un disque qui persiste : il contient les projets.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
