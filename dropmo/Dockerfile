# Stage 1: Build the Vue.js frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the Vue.js application
# The output will be in the /app/dist directory
RUN npm run build

# Stage 2: Create the final production image
FROM node:20-alpine

WORKDIR /app

# Copy only the production dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules
# Copy server script and package files
COPY package*.json ./
COPY server.js ./

# Copy the built Vue.js app from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the port the server will run on
EXPOSE 3000

# The command to run when the container starts
CMD ["node", "server.js"]
