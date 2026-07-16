FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy server code
COPY . .

# Expose server port
EXPOSE 3001

# Set production environment variable
ENV NODE_ENV=production

# Start server
CMD ["node", "index.js"]
