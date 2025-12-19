# INITE Auth Frontend - Deployment Guide

## 📦 Деплой фронтенда для auth service

### Вариант 1: Встроить в Backend (Рекомендуется)

Добавить static serving в NestJS:

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Serve frontend static files
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'out')));
  
  // Fallback to index.html for SPA routes
  app.use('*', (req, res, next) => {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/oauth') && !req.url.startsWith('/auth') && !req.url.startsWith('/identity')) {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'out', 'index.html'));
    } else {
      next();
    }
  });
  
  await app.listen(3002);
}
```

Build frontend как static export:

```json
// frontend/next.config.js
module.exports = {
  output: 'export',
  trailingSlash: true,
}
```

```bash
cd frontend
npm run build
# Копируем out/ в backend
```

### Вариант 2: Отдельный контейнер (для масштабирования)

Обновить `docker-compose.yml`:

```yaml
services:
  # Auth Frontend
  auth-frontend:
    build: ./frontend
    container_name: inite-auth-frontend
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.auth-frontend.rule=Host(`auth.inite.ai`)"
      - "traefik.http.routers.auth-frontend.entrypoints=websecure"
      - "traefik.http.routers.auth-frontend.tls=true"
      - "traefik.http.services.auth-frontend.loadbalancer.server.port=3003"
    environment:
      - NEXT_PUBLIC_API_URL=https://auth.inite.ai
    networks:
      - traefik-global
```

### Вариант 3: CDN (для production)

Deploy на Vercel/Netlify:

```bash
cd frontend
vercel --prod
# или
netlify deploy --prod
```

Обновить CORS на backend для CDN URL.

## 🚀 Quick Deploy

### Development

```bash
cd /Users/mikefluff/Documents/inite-auth-service/frontend
npm install
npm run dev
```

Откройте http://localhost:3003

### Production

```bash
# Build
cd frontend
npm run build

# Docker
docker build -t inite-auth-frontend:latest .
docker run -p 3003:3003 \
  -e NEXT_PUBLIC_API_URL=https://auth.inite.ai \
  inite-auth-frontend:latest
```

## 🎨 Screenshots

### Login Page
- Красивый выбор метода аутентификации
- 3 карточки: Passkey, Magic Link, Password
- Анимированные переходы
- Dark mode

### Passkey Auth
- WebAuthn prompt
- Touch ID / Face ID support
- Cross-platform passkeys

### Account Management
- User profile с DID
- Linked wallets
- Registered passkeys
- Wallet linking функция

## 🔧 Customization

### Branding

Обновите цвета в `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        500: '#your-color',
        // ...
      }
    }
  }
}
```

### Logo

Замените файл в `public/logo.svg`

### Favicon

Замените файлы в `public/`:
- `favicon.ico`
- `apple-touch-icon.png`
- `android-chrome-192x192.png`

## 📱 Mobile

Frontend полностью responsive:
- Touch-friendly кнопки
- Passkey работает на iOS/Android
- PWA ready (можно добавить manifest)

## 🐛 Troubleshooting

### Build errors

```bash
rm -rf node_modules .next
npm install
npm run build
```

### CORS errors

Добавьте frontend URL в backend CORS:

```typescript
// backend src/main.ts
app.enableCors({
  origin: ['http://localhost:3003', 'https://auth.inite.ai'],
})
```

### WebAuthn не работает

- Нужен HTTPS (или localhost)
- Проверьте RP_ID на backend
- Убедитесь что домен совпадает

## 🎯 Next Steps

1. ✅ Deploy frontend на auth.inite.ai
2. ✅ Настроить SSL сертификаты
3. ✅ Тестировать все auth flows
4. ⏳ Добавить OAuth consent screen
5. ⏳ Добавить rate limiting UI
6. ⏳ Добавить admin panel

## 📚 Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/)
- [WebAuthn Guide](https://webauthn.guide/)
- [Framer Motion](https://www.framer.com/motion/)


