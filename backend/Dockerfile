FROM node:20-slim

# Install system dependencies needed for file conversion
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libreoffice \
    chromium \
    fonts-liberation \
    fonts-noto \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium (not download its own)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "index.js"]
