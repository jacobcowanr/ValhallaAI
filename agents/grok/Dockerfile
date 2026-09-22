FROM node:20-alpine

WORKDIR /app

# Install dependencies
RUN npm install axios

# Copy agent code
COPY agent.js ./

# Create config directory
RUN mkdir -p /app/config

ENV NODE_ENV=production

CMD ["node", "agent.js"]
