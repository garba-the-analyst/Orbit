# ORBIT web app image: builds the Vue/Ionic app and serves the static files with nginx.
# The app finds the API at the same host on port 4000 unless VITE_API_URL is given at build time:
#   docker build --build-arg VITE_API_URL=https://api.example.com/api -t orbit-web mobile

FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
