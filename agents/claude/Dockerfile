FROM node:20-alpine

WORKDIR /app

# Install dependencies
RUN npm install @anthropic-ai/sdk axios

# Copy agent code
COPY agent.js ./

# Create config directory
RUN mkdir -p /app/config

# Set environment
ENV NODE_ENV=production

# Run agent
CMD ["node", "agent.js"]
