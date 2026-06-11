FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY data ./data

ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["node", "server.js"]
