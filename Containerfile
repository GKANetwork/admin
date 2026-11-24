FROM node:24-alpine
WORKDIR /app/ui
COPY auth/package*.json ./auth/
RUN cd auth && npm ci
COPY admin/package*.json ./admin/
RUN cd admin && npm ci
COPY auth ./auth
COPY admin ./admin
RUN cd admin && npm run build
ENV NODE_ENV=production
WORKDIR /app/ui/admin
EXPOSE 3000
CMD ["npm", "start"]
