# Contributing to Texas Hold'em Poker

Thank you for considering contributing to our project! Please read this guide to get started.

## 📋 Table of Contents
- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Request Process](#pull-request-process)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Community](#community)

## 📜 Code of Conduct
Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## 🤔 How Can I Contribute?

### 🐛 Reporting Bugs
Before submitting a bug report, please check if it has already been reported by searching the [Issues](../../issues).

When you are creating a bug report, please include:
- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots or screen recordings if applicable
- Environment details (OS, browser version, etc.)

### 💡 Suggesting Features
Feature requests are welcome! Please open an issue describing:
- The problem your feature would solve
- How the feature would work
- Any potential drawbacks or considerations

### 👩‍💻 Your First Code Contribution
Unsure where to begin? Look for issues labeled with `good first issue` or `help wanted`.

### 🔀 Pull Request Process
1. Fork the repository and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure the test suite passes
4. Make sure your code lints
5. Issue that pull request!

## 🛠️ Development Setup

### Prerequisites
- Node.js >= 22
- Docker & Docker Compose
- Redis >= 7
- PostgreSQL >= 16
- Git

### Getting Started
1. Fork and clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development services:
   ```bash
   docker compose -f docker/docker-compose.yml up -d redis postgres
   ```
4. Configure environment variables:
   ```bash
   cp client/.env.example client/.env
   cp poker-server/.env.example poker-server/.env
   # Edit the .env files with your settings
   ```
5. Start the development servers:
   ```bash
   npm run dev
   ```
   This will start both client and server concurrently.

## 📝 Coding Standards

### TypeScript
- We use ESLint with @typescript-eslint parser
- Prettier for code formatting
- Strict null-checks enabled

### Vue.js
- Single File Components (.vue)
- Composition API preferred
- PascalCase for component names

### Node.js/Backend
- Modular architecture (DDD-inspired)
- Dependency injection where appropriate
- Async/await for asynchronous operations
- Comprehensive error handling

## 🧪 Testing

### Backend
- Unit tests: Vitest
- E2E tests: Custom test framework with Redis
- Run tests: `npm run test` (in poker-server)

### Frontend
- Unit tests: Vitest + Vue Test Utils (planned)
- Run tests: `npm run test` (in client)

### Code Quality
- ESLint: `npm run lint`
- Prettier: `npm run format`
- Type checking: `npm run typecheck`

## 🌐 Community
- Join our Discord community for discussions
- Follow us on Twitter for updates
- Check out our roadmap on the project wiki

## 💡 Getting Help
If you need help, please:
1. Check the documentation
2. Search existing issues
3. Ask in the Discord community
4. Open an issue if you still need assistance

Thank you again for contributing to Texas Hold'em Poker!