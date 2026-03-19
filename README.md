# CocoShell

Turn your script claude-like in 2s.

## Install

```sh
npm install -g cocoshell
```

Or link locally:

```sh
cd CocoShell && npm install && npm run build && npm link
```

## Usage

```sh
cocoshell ./deploy.sh
cocoshell ./deploy.sh --env prod
cocoshell python3 build.py
cocoshell npm run build
cocoshell git pull origin main
```

No changes to your script needed.

## What gets enhanced automatically

| Pattern | Rendered as |
|---|---|
| `error` / `failed` / `ENOENT` | ✗ red |
| `done` / `success` / `compiled` | ✓ green |
| `warning` / `deprecated` | ⚠ yellow |
| `key=value` or `key: value` | styled badge |
| `80%` / `[===>  ]` | progress bar |
| silence > 500ms | auto spinner |

Every run gets a header (script name + timestamp) and footer (exit code + duration).
