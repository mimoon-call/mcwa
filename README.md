# MCWA - Mimoon Call WhatsApp Automation

A powerful WhatsApp automation platform built with React 19, TypeScript, and Node.js. Features WhatsApp instance management, AI-powered messaging, conversation warming, and real-time monitoring with a modern web interface.

## 🚀 Features

- **WhatsApp Automation** - Multi-instance WhatsApp management
- **AI-Powered Messaging** - OpenAI integration for intelligent responses
- **Conversation Warming** - Automated conversation management and engagement
- **Real-time Monitoring** - Live instance status and conversation tracking
- **Multi-language Support** - i18n with Hebrew and English
- **Modern Web UI** - React 19 with TailwindCSS and responsive design
- **Real-time Updates** - Socket.IO for live data synchronization
- **Authentication System** - Secure login with JWT tokens
- **Database Integration** - MongoDB for data persistence
- **Docker Support** - Easy deployment and scaling

## 🏗️ Project Structure

```
mcwa/
├── src/
│   ├── client/         # React frontend (pages, components, store)
│   │   ├── pages/      # Home, Instance management, Login
│   │   ├── components/ # Reusable UI components
│   │   ├── store/      # Redux Toolkit state management
│   │   └── locale/     # Internationalization (en, he)
│   ├── server/         # Node.js backend with Express
│   │   ├── api/        # REST API endpoints (auth, instance)
│   │   ├── services/   # WhatsApp, AI, database services
│   │   └── middleware/ # Authentication and validation
│   └── shared/         # Common types, helpers, and models
├── public/             # Static assets
├── Dockerfile          # Docker configuration
├── buildspec.yml       # CI/CD pipeline
└── package.json        # Dependencies and scripts
```

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS, Redux Toolkit
- **Backend**: Node.js, Express, TypeScript
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.IO
- **AI**: OpenAI API integration
- **WhatsApp**: Baileys library
- **Build**: Vite with SSR support
- **Deployment**: Docker, AWS CodeBuild

## 🚀 Getting Started

### Prerequisites
- Node.js 22.18+
- npm 10+
- MongoDB instance
- OpenAI API key (for AI features)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd mcwa
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Setup**
Create `.env.development` file:
```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
OPENAI_API_KEY=your_openai_api_key
ACCESS_TOKEN_KEY=your_jwt_secret
WEBHOOK_SECRET=your_webhook_secret
```

4. **Database Setup**
```bash
npm run run:seed
```

### Development

Start the development server:
```bash
npm run dev
```

This starts both the client (Vite dev server) and server (Express with SSR) simultaneously.

### Production

Build the application:
```bash
npm run build
```

Start production server:
```bash
npm run start
```

## 📱 WhatsApp Features

### Instance Management
- Create and manage multiple WhatsApp instances
- QR code generation for device connection
- Instance status monitoring and health checks

### AI Integration
- OpenAI-powered message responses
- Intelligent conversation handling
- Automated message generation

### Conversation Warming
- Automated conversation management
- Engagement tracking and analytics
- Scheduled warming activities

### Real-time Monitoring
- Live instance status updates
- Conversation activity tracking
- Performance metrics and insights

## 🔐 Authentication

- Email/password login system
- JWT-based access tokens
- Protected routes and middleware
- Token refresh mechanism

## 🌍 Internationalization

- Multi-language support (English, Hebrew)
- Dynamic language switching
- Localized date and number formatting

## 🐳 Docker Deployment

Build and run with Docker:
```bash
docker build -t mcwa .
docker run -p 3000:3000 mcwa
```

## 📊 API Endpoints

- `POST /api/auth/login` - User authentication
- `POST /api/auth/refresh` - Token refresh
- `GET /api/instance` - List WhatsApp instances
- `POST /api/instance` - Create new instance
- `PUT /api/instance/:id` - Update instance
- `DELETE /api/instance/:id` - Delete instance

## 🔧 Development Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run run:seed` - Seed database with initial data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is private and proprietary.

---

Built with ❤️ by the Mimoon Call team
