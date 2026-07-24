# Texas Hold'em Poker Platform

A production-grade, full-stack Texas Hold'em poker platform featuring:

- 🎮 Real-time multiplayer gameplay with WebSocket connections
- 🔐 Secure authentication via Supabase (email, phone, social logins)
- 🤖 AI bot opponents for practice and filling tables
- 📊 Real-time game statistics and analytics via Prometheus/Grafana
- 🔒 Enterprise-grade security: IP blocking, action signing, rate limiting
- 🚀 Zero-downtime deployments with GitHub Actions and PM2
- 📱 Responsive Vue 3 + Tailwind CSS frontend
- ⚙️ Modular, extensible backend architecture (Node.js/TypeScript)

## 🏗️ Architecture

```
├── client/                 # Vue 3 + Vite frontend
├── poker-server/           # Node.js/TypeScript backend
├── docker/                 # Docker-compose for local development
├── deploy/                 # Production deployment scripts & Nginx config
└── tests/                  # Load testing and E2E test utilities
```

## 🚀 Quick Start

### Prerequisites
- Node.js >= 22
- Docker & Docker Compose (for local development)
- Redis >= 7
- PostgreSQL >= 16

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/hishuai01-collab/Texas-Hold-em.git
cd Texas-Hold-em
```

2. Start infrastructure services:
```bash
docker compose -f docker/docker-compose.yml up -d redis postgres prometheus grafana
```

3. Start the backend:
```bash
cd poker-server
cp .env.example .env
# Edit .env with your local settings
npm run dev
```

4. Start the frontend:
```bash
cd ../client
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

Visit http://localhost:5173 to play!

## 🐳 Docker Deployment

See [docker/README.md](docker/README.md) for full Docker deployment instructions.

## 🚢 Production Deployment

See [deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md) for detailed production deployment guide.

## � Testing

- Backend unit tests: `cd poker-server && npm test`
- Backend E2E tests: `cd poker-server && npm run test:e2e`
- Frontend: Vue Test Utils + Vitest (coming soon)
- Load testing: See `tests/load/load-tester.js`

## 📚 Documentation

- [Design System](DESIGN_SYSTEM.md)
- [Architecture Analysis](DESIGN_ANALYSIS.md)
- [API Documentation](poker-server/README.md)
- [Frontend Guide](client/README.md)

## 📜 License

MIT

## 🙏 Acknowledgments

- Built with ❤️ using Node.js, Vue 3, TypeScript, and Docker
- Inspired by open-source poker implementations worldwide