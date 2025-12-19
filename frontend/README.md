# INITE Auth Service - Frontend

Красивый, современный UI для INITE Identity Provider с поддержкой:
- ✅ Passkey (WebAuthn) authentication
- ✅ Email magic link (passwordless)
- ✅ Password authentication (legacy)
- ✅ Wallet linking (SIWE)
- ✅ Account management
- ✅ OAuth2/OIDC consent flow

## 🎨 Features

- **Modern UI** - Tailwind CSS + Framer Motion animations
- **Dark Mode** - Автоматический dark mode
- **Responsive** - Работает на всех устройствах
- **Type-Safe** - TypeScript
- **Fast** - Next.js App Router

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

Откройте [http://localhost:3003](http://localhost:3003)

## 📁 Structure

```
frontend/
├── app/
│   ├── page.tsx              # Home (redirects to login)
│   ├── login/page.tsx        # Login page with method selection
│   ├── account/page.tsx      # Account management
│   └── verify/page.tsx       # Magic link verification
├── components/
│   ├── PasskeyAuth.tsx       # Passkey authentication
│   ├── MagicLinkAuth.tsx     # Email magic link
│   └── PasswordAuth.tsx      # Password auth (legacy)
├── lib/
│   └── api.ts                # Axios API client
└── public/                   # Static assets
```

## 🔧 Configuration

Создайте `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3002
```

Для production:

```bash
NEXT_PUBLIC_API_URL=https://auth.inite.ai
```

## 🎯 Usage

### Passkey Authentication

1. Пользователь выбирает "Passkey"
2. Для нового пользователя - регистрация с email
3. Браузер показывает WebAuthn prompt (Touch ID, Face ID, etc.)
4. Passkey сохраняется и можно входить без пароля

### Magic Link

1. Пользователь вводит email
2. Получает письмо с магической ссылкой
3. Кликает по ссылке → автоматический вход

### Password (Legacy)

1. Email + Password
2. Опциональная регистрация
3. Традиционный flow

### Wallet Linking

На странице Account:
1. Кнопка "Link Wallet"
2. MetaMask подпись SIWE сообщения
3. Кошелек привязывается к DID

## 🔐 OAuth2 Flow

Когда пользователь переходит по ссылке:

```
https://auth.inite.ai/oauth/authorize?
  response_type=code&
  client_id=break3&
  redirect_uri=https://break3.inite.health/callback&
  scope=openid profile email&
  code_challenge=...&
  code_challenge_method=S256
```

1. Показываем UI выбора метода аутентификации
2. После успешной аутентификации создаем authorization code
3. Редиректим обратно на `redirect_uri` с кодом

## 🎨 UI Components

### Login Page
- 3 карточки методов аутентификации
- Анимированные переходы
- Responsive grid layout
- Dark mode support

### Account Page
- User profile с DID
- Список passkeys
- Список привязанных кошельков
- Logout функционал

### Verify Page
- Loading state
- Success/Error states
- Auto-redirect после успеха

## 🚢 Production Build

```bash
# Build
npm run build

# Start production server
npm start
```

### Docker

Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 3003
CMD ["npm", "start"]
```

Build и run:

```bash
docker build -t inite-auth-frontend .
docker run -p 3003:3003 -e NEXT_PUBLIC_API_URL=https://auth.inite.ai inite-auth-frontend
```

## 🎭 Theming

Цветовая схема:
- **Passkey**: Blue → Cyan gradient
- **Magic Link**: Purple → Pink gradient
- **Password**: Gray gradient

Можно настроить в `tailwind.config.js`

## 📱 Mobile Support

- Touch-friendly buttons
- Responsive layouts
- Passkey работает на iOS/Android
- PWA ready

## 🔒 Security

- HTTPS only в production
- HttpOnly cookies для tokens (TODO на backend)
- PKCE для OAuth2
- CSP headers (TODO)

## 🐛 Troubleshooting

### WebAuthn не работает

- Нужен HTTPS или localhost
- Проверьте browser support
- Убедитесь что RP_ID совпадает с доменом

### API errors

- Проверьте `NEXT_PUBLIC_API_URL`
- Проверьте CORS на backend
- Смотрите browser console

### Dark mode не работает

- Используется prefers-color-scheme
- Проверьте системные настройки

## 📚 Tech Stack

- **Next.js 14** - App Router
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **@simplewebauthn/browser** - WebAuthn
- **Ethers.js** - Wallet integration
- **React Hot Toast** - Notifications
- **Lucide React** - Icons

## 🤝 Contributing

1. Fork the repo
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit PR

## 📄 License

UNLICENSED - Private project


