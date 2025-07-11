FROM node:22.17.0-alpine as base

ENV NODE_ENV=local

WORKDIR /app

COPY package*.json .

RUN npm install && npm cache clean --force

COPY . .

FROM base as local

CMD npm run dev
