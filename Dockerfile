FROM node:20-alpine AS builder
WORKDIR /app

# Install deps first (better cache)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy the rest and build
COPY . .
# Expect scripts:
#   "docs:build": "vitepress build"
RUN yarn docs:build

# Runtime server (static docs + signed private resume endpoint)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/docs/.vitepress/dist /app/dist
COPY --from=builder /app/docs/index.md /app/context/docs/index.md
COPY --from=builder /app/docs/resume/index.md /app/context/docs/resume/index.md
COPY --from=builder /app/docs/projects/index.md /app/context/docs/projects/index.md
COPY --from=builder /app/docs/projects/public-repos.md /app/context/docs/projects/public-repos.md
COPY --from=builder /app/docs/projects/data/public-repos.json /app/context/docs/projects/data/public-repos.json
COPY server/site-server.mjs /app/server/site-server.mjs

EXPOSE 80
CMD ["node", "/app/server/site-server.mjs"]
