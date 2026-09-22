FROM node:20-alpine

WORKDIR /app

# Install dependencies
RUN npm install @anthropic-ai/sdk axios

# Copy agent code
# Build context is ./agents (see docker-compose.local.yml), so paths are
# relative to that -- this is what lets both agents share task.js.
COPY claude/agent.js ./
COPY _shared/task.cjs ./task.cjs

# Create config directory
RUN mkdir -p /app/config

# Set environment
ENV NODE_ENV=production

# Run agent
CMD ["node", "agent.js"]
