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
      nodejs \
      npm && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.ssh && \
    echo "StrictHostKeyChecking accept-new" >> /root/.ssh/config && \
    chmod 700 /root/.ssh

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/src ./src

ENTRYPOINT ["bun", "run", "src/cli/index.ts"]
CMD ["start"]
