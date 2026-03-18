FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

EXPOSE 8080
ENV PORT=8080

CMD ["npm", "start"]
