# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Don't open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. You should get a reply within a week. Once a fix is out, we'll credit you in the release notes unless you'd rather stay anonymous.

## Supported versions

Only the latest commit on `main` gets security fixes.

## Scope

gwiki is a static app: each user's browser talks to Google with that user's own token, and there is no gwiki server or database. Things worth reporting include:

- Content from an exported Doc escaping the sanitiser or the sandboxed iframe.
- Requests or file lookups that reach outside the configured Shared Drive or folder.
- Tokens leaking out of `sessionStorage` or to anything other than Google.
- Weaknesses in the shipped headers (`deploy/security-headers.conf`) or the Docker image.

Out of scope: who can see what in Google Drive (that's your Drive sharing settings), and problems in a deployment's own `config.json` or hosting.

An OAuth **client ID** is public by design and is not a secret. Client secrets, API keys and access tokens are, and none belong in this repository.
