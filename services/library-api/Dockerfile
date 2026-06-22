FROM node:24-alpine AS production
WORKDIR /app
COPY services/library-api/package*.json ./services/library-api/
RUN cd services/library-api && npm ci --omit=dev
COPY apps/web ./apps/web
COPY services/library-api ./services/library-api
WORKDIR /app/services/library-api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate:postgres && npm run db:seed:postgres && npm start"]
