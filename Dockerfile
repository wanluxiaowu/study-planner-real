FROM node:24-alpine

WORKDIR /app
COPY . .

ENV PORT=4173
EXPOSE 4173

CMD ["node", "server.mjs"]
