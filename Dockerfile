# تصویر اجرای برنامه روی لیارا (پلتفرم Docker)
# دیتاست از PostgreSQL خوانده می‌شود؛ فایل CSV داخل ایمیج لازم نیست.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# سقف heap برای دیتاست کامل؛ با NODE_HEAP_MB قابل تغییر است
CMD ["sh","-c","exec node --max-old-space-size=${NODE_HEAP_MB:-384} --max-semi-space-size=8 server.js"]
