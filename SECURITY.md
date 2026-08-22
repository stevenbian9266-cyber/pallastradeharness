# Security Policy

## Reporting a Vulnerability

This project takes security seriously. If you believe you have found a security
vulnerability in **pallastrade-harness**, please report it privately — do **not**
open a public issue.

**How to report:**

1. Use GitHub **Private vulnerability reporting** on this repository
   (Security → Report a vulnerability), or
2. Open a private advisory, or
3. If neither is available, email the maintainers with a subject line starting
   with `[SECURITY]`.

**What to include:**

- Affected version(s) and the steps to reproduce (minimal fixture preferred)
- Impact: what an attacker could achieve
- Suggested fix (optional)

**Our commitment:**

- We will acknowledge your report within **5 business days**.
- We will keep you informed of progress toward a fix.
- Security fixes are released as soon as a patch is ready; the fix and a
  coordinated disclosure are published together.

## Supported Versions

| Version | Supported |
|---|---|
| latest stable (≥ 1.6.0) | ✅ |
| older minors | ⚠️ best-effort, see changelog |

## Scope / Non-Goals

- A malicious admin with full repo/CI write access is **out of scope** — local
  tools cannot defend against an attacker who can rewrite every state file.
  For strong guarantees, protect the branch and rely on CI/remote attestation.
- Secrets (`sk_live_...`, `AKIA...`, `ghp_...`) must never be committed; the
  `scan-secrets` hook blocks them at commit time.
