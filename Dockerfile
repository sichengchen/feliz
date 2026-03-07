# Stage 1: Install dependencies
FROM oven/bun:1 AS deps

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production

# Stage 2: Build
FROM oven/bun:1 AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun run build

# Stage 3: Runtime
FROM oven/bun:1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      git \
      openssh-client \
      curl \
      ca-certificates \
      gpg \
      nodejs \
      npm && \
    rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r feliz && useradd -r -g feliz -m -s /bin/bash feliz

ENV PATH="/home/feliz/.local/bin:$PATH"

# Set up SSH for feliz user
RUN mkdir -p /home/feliz/.ssh && \
    echo "StrictHostKeyChecking accept-new" >> /home/feliz/.ssh/config && \
    chmod 700 /home/feliz/.ssh && \
    chown -R feliz:feliz /home/feliz/.ssh

# Create data, config, and bun global dirs owned by feliz
RUN mkdir -p /data/feliz /home/feliz/.feliz /home/feliz/.bun && \
    chown -R feliz:feliz /data/feliz /home/feliz/.feliz /home/feliz/.bun

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER feliz

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
