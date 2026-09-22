FROM alpine:latest

# git wasn't installed here before — alpine:latest is busybox, no git
# binary by default. vault_relay.sh's git pull/add/commit/push all failed
# immediately as a result. openssh-client is for pushing over ssh:// remotes
# (HOST_SSH_DIR is mounted for exactly this).
RUN apk add --no-cache git openssh-client

WORKDIR /repo

COPY vault_relay.sh /vault_relay.sh
RUN chmod +x /vault_relay.sh

ENTRYPOINT ["/bin/sh", "/vault_relay.sh"]
