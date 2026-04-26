FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# Code is mounted at runtime via docker-compose volume
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
