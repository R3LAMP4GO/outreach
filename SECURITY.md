# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main branch) | Yes |
| Older versions | No |

Only the latest deployed version receives security updates.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email **__YOUR_SECURITY_EMAIL__** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested remediation (optional)

2. You will receive an acknowledgment within **48 hours**.

3. We will investigate and provide a detailed response within **7 business days**, including:
   - Confirmation of the vulnerability
   - Severity assessment
   - Planned remediation timeline

### What to Expect

- We take all reports seriously and will respond promptly
- We will keep you informed of our progress
- We will credit reporters (unless anonymity is requested) when fixes are published
- We will not take legal action against researchers who follow responsible disclosure

### Scope

The following are in scope for security reports:

- **__YOUR_DOMAIN__** and all subdomains
- API endpoints under `/api/*`
- Authentication and session management
- Data exposure or leakage
- Server-side request forgery (SSRF)
- Cross-site scripting (XSS)
- SQL injection or NoSQL injection
- Broken access controls
- Webhook signature bypass

### Out of Scope

- Denial of service (DoS/DDoS) attacks
- Social engineering attacks
- Physical security
- Third-party services (Railway, Resend, Cal.com, Anthropic) -- report directly to those vendors
- Vulnerabilities in dependencies with no demonstrated exploit path
- Rate limiting on non-sensitive endpoints

## Security Practices

For details on our internal security standards, see our [Security Standards](docs/security/SECURITY_STANDARDS.md) documentation.
