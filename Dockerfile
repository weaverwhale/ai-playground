FROM node:22-slim

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3030

# Start the application
CMD ["npm", "start"] 