# Image pour la mise en ligne. Le nom affiché est dans src/marque.ts (une seule ligne).
# Les réglages (mot de passe, clé de l'IA) se donnent à l'hébergeur, jamais ici.
# Le dossier /data doit être un disque qui persiste (un « volume » chez Railway) : il contient les projets.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY polices ./polices
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
