# purva-netra-web: built PWA served by nginx; /api is proxied to the API container
FROM node:24-slim AS build
ARG PN_BUILD=dev
ENV PN_BUILD=$PN_BUILD
WORKDIR /w
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM nginx:1.27-alpine
COPY --from=build /w/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
