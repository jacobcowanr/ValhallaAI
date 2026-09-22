FROM alpine:latest

# This image still does not install the Hermes CLI. The working run path
# is scripts/run_agent.sh hermes-agent, which calls the host `hermes`
# binary. A Linux image cannot run the macOS virtualenv that binary is,
# and a second install sharing the same Hermes home would race the proxy
# already running on the host. run.sh records that if this container is
# started anyway.
RUN apk add --no-cache bash

WORKDIR /app

# Copy entrypoint script
COPY run.sh ./
RUN chmod +x ./run.sh

# Map Hermes home
ENV HERMES_HOME=/root/.hermes
ENV VAULT_PATH=/vault

CMD ["./run.sh"]
