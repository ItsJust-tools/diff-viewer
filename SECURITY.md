# Security Policy

## Reporting a Vulnerability

itsjust tools are privacy-first, client-side only applications. No user data leaves the browser. However, if you discover a security vulnerability, please report it responsibly.

## Scope

This policy applies to:

- All itsjust tools and repositories
- The template repository
- @itsjust/core packages

## What We Do NOT Consider Vulnerabilities

- Client-side only functionality (no server implications)
- Missing authentication (tools require zero signup by design)
- CORS issues (tools run entirely client-side)
- Missing SSL/TLS (tools are local-first)
- Third-party dependencies (unless actively exploited and known)

## What We DO Consider Vulnerabilities

- Cross-site scripting (XSS) vulnerabilities
- CSRF vulnerabilities in any web interface
- Prototype pollution in dependencies
- Known exploitable dependencies with CVEs
- Privacy violations (unexpected data exfiltration)
- Session hijacking vulnerabilities
- Server-side configuration issues (if using deployment)

## Reporting Process

1. **Disclose responsibly**: Provide clear steps to reproduce
2. **Impact assessment**: Describe potential impact and exploitation path
3. **Fix recommendation**: Suggest a mitigation if possible
4. **Timeframe**: Give us 72 hours for initial assessment

## Response Timeline

- Initial acknowledgment: Within 48 hours
- Triage update: Within 5 days
- Fix commitment: Within 10 days for critical issues
- Public disclosure: After fix is released

## Security Best Practices

For tool developers:

- Always validate and sanitize user input
- Use content security policy (CSP) headers
- Keep dependencies updated (enable Dependabot)
- Review third-party scripts carefully
- Test for XSS and CSRF vulnerabilities
- Use HTTPS in production deployments
- Never commit `.env` files

## Safe Harbor

We encourage responsible disclosure. We will not take legal action against good faith reporters who follow responsible disclosure practices.
