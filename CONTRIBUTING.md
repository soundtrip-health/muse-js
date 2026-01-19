# Contributing to muse-js

Thank you for your interest in contributing to muse-js!

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Start the demo: `npm run demo:install && npm start`

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Format code: `npm run format`
5. Submit a pull request

## Code Style

- We use TypeScript with strict mode enabled
- Code is formatted with Prettier (runs automatically on commit)
- ESLint enforces code quality rules
- Use single quotes for strings
- Prefer `const` over `let` when possible

## Testing

- Write tests for new functionality
- Tests use Jest and live in `*.spec.ts` files alongside the source
- Run tests with `npm test` or `npm run test:watch` for development

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include tests for new features or bug fixes
- Update documentation if needed
- Ensure CI passes before requesting review

## Reporting Issues

When reporting bugs, please include:
- Device model (Muse 1, 2, S, or 3)
- Browser and version
- Steps to reproduce
- Console output if applicable

## Questions?

Open an issue for questions or discussions about the codebase.
