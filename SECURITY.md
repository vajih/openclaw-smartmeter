# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | Yes                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in SmartMeter, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

Please use GitHub's private security advisory feature:

1. Go to https://github.com/vajih/openclaw-smartmeter/security/advisories/new
2. Click "New draft security advisory"
3. Fill in the details of the vulnerability
4. Click "Create draft security advisory"

Alternatively, you can email **vajihkhan@gmail.com** with details.

### What to Expect

- **Acknowledgment** within 48 hours of your report
- **Assessment** within 5 business days
- **Resolution timeline** communicated after assessment
- **Credit** in the release notes (unless you prefer anonymity)

## Security Considerations

### Data Handling

SmartMeter processes OpenClaw session logs which may contain:

- **User prompts and AI responses** - These remain local and are never transmitted externally
- **API usage metrics** - Token counts, costs, and model identifiers
- **File paths** - Session file locations on disk

### Data Storage

- All analysis data is stored locally at `~/.openclaw/smartmeter/`
- The `analysis.public.json` file (used by the dashboard) is sanitized to exclude:
  - Full file paths
  - Session-level details
  - Any API keys or credentials
- No data is sent to external servers

### Canvas Dashboard

- The dashboard runs locally via the OpenClaw gateway
- It serves static files from `~/.openclaw/canvas/smartmeter/`
- No external network requests are made by the dashboard
- Data refreshes happen via local HTTP polling only

### Dependencies

SmartMeter uses minimal dependencies to reduce supply chain risk:

| Dependency  | Purpose              | Risk Level |
|-------------|----------------------|------------|
| commander   | CLI argument parsing | Low        |
| open        | Browser launching    | Low        |
| fs-extra    | File operations      | Low        |

### Best Practices

- Keep Node.js and dependencies up to date
- Review `analysis.public.json` before sharing screenshots publicly
- Do not commit `~/.openclaw/` directory contents to version control (already in `.gitignore`)
- Rotate API keys if you suspect they were logged in session files

## Scope

The following are **in scope** for security reports:

- Data leakage in `analysis.public.json` (sensitive data not properly sanitized)
- Path traversal vulnerabilities in file operations
- Command injection via CLI arguments
- Dependency vulnerabilities with known CVEs

The following are **out of scope**:

- Issues in the OpenClaw platform itself (report to OpenClaw directly)
- Social engineering attacks
- Denial of service against local processes
