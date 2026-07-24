# Testing Strategy

This directory contains testing utilities and documentation for the Texas Hold'em Poker platform.

## Overview

The project employs a comprehensive testing strategy including:
- Unit tests for backend services
- End-to-end (E2E) tests for game flows
- Load testing for scalability validation
- Chaos engineering for resilience verification

## Backend Testing

Located in `poker-server/test/`:
- Unit tests: `test/*.test.ts`
- E2E tests: `test/e2e/*.test.ts`
- Chaos engineering tests: `test/e2e/chaos.test.ts`

Run backend tests:
```bash
cd poker-server
npm test          # Unit tests
npm run test:e2e  # E2E tests
```

## Frontend Testing

Frontend tests are located in `client/`:
- Unit tests: Using Vitest + Vue Test Utils (to be implemented)
- Component tests: Located alongside components or in `tests/`

## Load Testing

The `load/` directory contains:
- `load-tester.js`: Simulates multiple concurrent players
- Configuration for different test scenarios

Run load tests:
```bash
node tests/load/load-tester.js
```

## Chaos Engineering

See `.github/workflows/chaos.yml` for automated chaos experiments that:
- Simulate SIGKILL crashes
- Verify automatic recovery
- Validate state consistency after restarts

## Test Data & Fixtures

- Test fixtures are stored alongside test files
- Mock data generators are in `test/fixtures/`
- Temporary test data is cleaned up automatically

## Best Practices

1. Write unit tests for all new business logic
2. Add E2E tests for critical user flows
3. Keep tests fast and reliable
4. Use descriptive test names that explain the scenario
5. Mock external dependencies appropriately
6. Test edge cases and error conditions

## Continuous Integration

All tests run automatically on:
- Every push to `main`
- Every pull request
- Scheduled chaos engineering experiments

See `.github/workflows/ci.yml` for details.