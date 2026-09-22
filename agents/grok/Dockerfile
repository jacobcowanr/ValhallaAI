FROM node:20-alpine

WORKDIR /app

# No npm dependencies — agent.js uses Node's built-in https module.

# Copy agent code
COPY agent.js ./

# Create config directory
RUN mkdir -p /app/config

ENV NODE_ENV=production

CMD ["node", "agent.js"]
