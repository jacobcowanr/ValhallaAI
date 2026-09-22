FROM node:20-alpine

WORKDIR /app

# No npm dependencies — agent.js uses Node's built-in https module.

# Copy agent code
# Build context is ./agents (see docker-compose.local.yml), so paths are
# relative to that -- this is what lets both agents share task.js.
COPY grok/agent.js ./
COPY _shared/task.cjs ./task.cjs

# Create config directory
RUN mkdir -p /app/config

ENV NODE_ENV=production

CMD ["node", "agent.js"]
