# React SSR TypeScript Starter

A modern full-stack starter template featuring React 19, TypeScript, Vite, Express, Redux Toolkit, Socket.IO, i18n, and TailwindCSS, with server-side rendering (SSR) and authentication. Includes Docker support and production-ready configuration.

## Features

- **React 19** with functional components and hooks
- **TypeScript** throughout (client & server)
- **Server-Side Rendering (SSR)** via Express and Vite
- **Redux Toolkit** for state management
- **Socket.IO** for real-time communication
- **Authentication** (login, token refresh, protected routes)
- **i18n** (internationalization) with `react-i18next`
- **TailwindCSS** for styling
- **ESLint** and **Prettier** for code quality
- **Docker** support for easy deployment

## Project Structure

```
react-ssr-ts/
├── src/
│   ├── client/         # React client app (pages, components, store, router)
│   ├── server/         # Express server, SSR, API routes, middleware
│   └── shared/         # Shared code (types, helpers, models)
├── public/             # Static assets
├── Dockerfile          # Docker build config
├── buildspec.yml       # Build pipeline config
├── package.json        # Scripts and dependencies
└── README.md           # Project documentation
```

## Getting Started

### Prerequisites
- Node.js 22.18+
- npm 10+

### Install dependencies
```bash
npm install
```

### Development
Start the development server (with SSR):
```bash
npm run dev
```
- Client: Vite dev server
- Server: Express with SSR

### Build
Build both client and server bundles:
```bash
npm run build
```

### Production Start
```bash
npm run start
```

### Linting & Formatting
```bash
npm run lint
```

## Environment Variables
- `.env` and `.env.development` for secrets and config (see `src/server/index.ts` for usage)
- Example variables:
  - `ACCESS_TOKEN_KEY` (JWT secret)
  - `WEBHOOK_SECRET` (for webhook middleware)
  - `PORT` (server port)

## Docker
Build and run with Docker:
```bash
docker build -t react-ssr-ts .
docker run -p 3000:3000 react-ssr-ts
```

## Authentication
- Email/password login (see `src/server/api/auth/`)
- JWT-based access tokens (stored in cookies)
- Token refresh endpoint
- Protected routes (redirect to login if not authenticated)

## Internationalization (i18n)
- Language files in `src/client/locale/`
- Uses `react-i18next`

## Real-time Communication
- Socket.IO server and client integration
- Example: `/webhook/:userId` endpoint to push events

## Folder Highlights
- `src/client/pages/` – React pages (Home, Login)
- `src/client/shared/components/` – Reusable UI components
- `src/server/api/` – Express API routes (e.g., auth)
- `src/server/services/` – Server-side services (token, socket, validation)
- `src/shared/` – Shared helpers, types, and models

## Acknowledgements
- [Vite](https://vitejs.dev/)
- [React](https://react.dev/)
- [Redux Toolkit](https://redux-toolkit.js.org/)
- [Socket.IO](https://socket.io/)
- [TailwindCSS](https://tailwindcss.com/)
- [i18next](https://www.i18next.com/)

---

Feel free to contribute or open issues for improvements!
