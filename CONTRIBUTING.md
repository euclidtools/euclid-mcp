# Contributing to Euclid

Thanks for your interest in contributing! Euclid is open source and welcomes contributions of all kinds.

## Setup

```bash
git clone https://github.com/euclidtools/euclid.git
cd euclid
pnpm install
pnpm dev        # Run the MCP server locally
pnpm test       # Run all tests
```

Requires Node.js >= 20 and pnpm.

## Development Workflow

1. Fork the repo and create a feature branch
2. Write tests first (we use [vitest](https://vitest.dev))
3. Implement your changes
4. Run the full check suite before submitting:

```bash
pnpm format:check   # Prettier
pnpm lint            # ESLint
pnpm test            # Vitest
pnpm build           # tsup
```

CI runs all four checks on Node 20 and 22.

## Code Style

- TypeScript (strict mode), ESM modules
- Prettier: single quotes, trailing commas, 100 char width, 2-space indent
- Zod v4 for schema validation (import from `'zod/v4'`)
- Tool handlers return `{ content: [{ type: 'text', text: JSON.stringify(...) }], isError?: true }`

## Project Structure

```
src/
  index.ts              # Server entry point — registers tools, connects stdio
  engine.ts             # Core math engine (mathjs wrapper with sandboxing)
  normalization.ts      # Input normalization (Unicode, unit aliases, date formats)
  engines/
    datetime.ts         # Date/time engine (date-fns wrapper)
  tools/
    calculate.ts        # calculate tool definition
    convert.ts          # convert tool definition
    statistics.ts       # statistics tool definition
    datetime.ts         # datetime tool definition
  error-hints/
    index.ts            # Error hint registry + dispatcher
    calculate.ts        # calculate-specific hints
    convert.ts          # convert-specific hints
    statistics.ts       # statistics-specific hints
    datetime.ts         # datetime-specific hints
tests/                  # Vitest test files (one per tool + engine + edge cases)
skills/math/            # Skill files that teach LLMs when to use each tool
hooks/                  # Claude Code plugin hooks (session-start auto-registration)
```

## Adding a New Tool

Each tool follows the same pattern:

1. **Engine** (`src/engines/<name>.ts`) — Pure functions, no side effects. Returns `{ result: string, ... } | { error: string }`.
2. **Tool definition** (`src/tools/<name>.ts`) — Exports `{ name, description, inputSchema, handler }`. The description is an LLM prompt teaching when to use the tool.
3. **Error hints** (`src/error-hints/<name>.ts`) — Pattern-matched hints with examples so the LLM can self-correct.
4. **Registration** (`src/index.ts`) — Import and register via `server.registerTool()`.
5. **Tests** (`tests/<name>.test.ts`) — Engine-level and tool-level tests.
6. **Skill doc** (`skills/math/<NAME>.md`) — Reference doc for LLMs.

See the existing `datetime` tool for the most recent example of this pattern.

## High-Impact Contributions

- **Tool descriptions** — The prompt text that teaches models _when_ to use Euclid. This is harder than it sounds and has the biggest impact on real-world usefulness.
- **Test cases** — Edge cases where LLMs commonly hallucinate math (multi-step expressions, trig, large numbers, date boundary conditions).
- **New calculation domains** — Financial math, probability, geometry, or other areas where deterministic output matters. Check the [expansion plan](https://github.com/euclidtools/euclid) for what's planned.
- **Benchmark data** — Comparing raw LLM output vs Euclid-assisted output across different models.

## Submitting a PR

- Keep PRs focused — one feature or fix per PR
- Include tests for any new functionality
- Update skill docs if you add or change tool behavior
- Write a clear PR description explaining _why_, not just _what_

## Questions?

Open an issue on GitHub. We're happy to help you find the right place to contribute.
