FROM alpine:latest

RUN apk add --no-cache bash

WORKDIR /app

# Copy entrypoint script
COPY run.sh ./
RUN chmod +x ./run.sh

# Map Hermes home
ENV HERMES_HOME=/root/.hermes
ENV VAULT_PATH=/vault

CMD ["./run.sh"]
