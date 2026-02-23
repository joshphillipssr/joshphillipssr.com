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

# Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/docs/.vitepress/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]