# Contributing

Thanks for helping. Bug reports, fixes and small features are all welcome.

## Set up

You need Node 26 (see `.nvmrc`) and a Google OAuth client and a Drive folder to point the app at. The README's **Set up Google Cloud** and **Configure** sections walk through both.

```bash
npm install
cp public/config.example.json public/config.json   # then fill it in
npm run dev                                          # http://localhost:3000
```

`public/config.json` is git-ignored. Never commit one: it holds your client ID and drive.

## Before you open a pull request

Run what CI runs:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

- Keep each PR to one change, and say in the description what it fixes or adds and how you checked it.
- Add or update tests in `src/**/*.test.ts` for logic changes.
- Nothing brand-specific in the code: names, colours and copy belong in `config.json`. New UI text goes in `src/messages.ts` so it can be overridden and translated.
- Talk to Google only through the official endpoints in `src/google/`, and keep requests scoped to the configured Shared Drive or folder.
- For UI changes, attach before and after screenshots.

## Bigger changes

Open an issue first so we can agree on the approach before you spend time on it.

## Security issues

Don't open a public issue. See [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
