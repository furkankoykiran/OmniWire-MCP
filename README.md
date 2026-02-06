# OmniWire MCP Server ⚡️

![Release](https://img.shields.io/badge/release-v1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![MCP](https://img.shields.io/badge/MCP-Compatible-orange)

**OmniWire-MCP** is a production-ready, fault-tolerant news aggregation server built on the **Model Context Protocol (MCP)**. It bridges the gap between AI models and real-time information by providing a unified interface for consuming RSS, Atom, JSON, and HTML feeds.

Designed for resilience, it features a **Sentinel Service** with Circuit Breakers to handle failing sources gracefully and a **Universal Parser** that automatically adapts to different content formats.

---

## ✨ Features

*   **Universal Parsing**: Automatically detects and parses RSS, Atom, JSON, and HTML content.
*   **Sentinel Architecture**: Intelligent Circuit Breakers monitor source health, preventing cascading failures.
*   **Dynamic Configuration**: Hot-reload sources via remote JSON config (`RSS_FEEDS`) or fallback to local defaults.
*   **Data Normalization**: Transforms diverse feed formats into a standardized `NewsItem` schema.
*   **AI-Native**: Exposes specialized Tools and Prompts optimized for LLM consumption.
*   **Zero-Config Deployment**: Runs instantly via `npx` or Docker.

---

## 🚀 Quick Start

### Using `npx` (Global)

**Prerequisite:** The package must be published to NPM or installed globally.

```bash
npx omniwire-mcp
```

### Local Testing (Without Publishing)

If you are developing locally and want to test the `npx` command:

1.  Link the package globally:
    ```bash
    cd OmniWire-MCP
    npm link
    ```
2.  Run with `npx`:
    ```bash
    npx omniwire-mcp
    ```

### Custom Configuration

You can configure the server in two ways:

1.  **Remote URL**: Provide a URL to a JSON configuration file.
    ```bash
    RSS_FEEDS="https://raw.githubusercontent.com/furkankoykiran/OmniWire-MCP/refs/heads/main/src/config/defaults/feeds.json" npx omniwire-mcp
    ```

2.  **Direct JSON**: Pass the configuration JSON directly as a string.
    ```bash
    RSS_FEEDS='{"sources": [...]}' npx omniwire-mcp
    ```

---

## 📦 Installation & Publishing

### Publish to NPM (Recommended)

To make `npx omniwire-mcp` available to everyone:

1.  Login to NPM:
    ```bash
    npm login
    ```
2.  Publish the package:
    ```bash
    npm publish --access public
    ```

### Option 1: Docker (Cloud/Production)

The server is Docker-ready for easy deployment.

```bash
# Build the image
docker build -t omniwire-mcp .

# Run with custom config
docker run -e RSS_FEEDS="https://raw.githubusercontent.com/furkankoykiran/OmniWire-MCP/refs/heads/main/src/config/defaults/feeds.json" omniwire-mcp
```

### Option 2: Local Development

1.  Clone the repository:
    ```bash
    git clone https://github.com/furkankoykiran/OmniWire-MCP.git
    cd OmniWire-MCP
    ```

2.  Install dependencies and build:
    ```bash
    npm install
    npm run build
    ```

3.  Run the server:
    ```bash
    npm start
    ```

---

## 🔌 MCP Configuration

Add OmniWire to your MCP client configuration (e.g., `claude_desktop_config.json` or `mcp_config.json`).

### Standard Configuration (`npx`)

```json
{
  "mcpServers": {
    "omniwire": {
      "command": "npx",
      "args": [
        "-y",
        "@furkankoykiran/omniwire-mcp"
      ],
      "env": {
        "RSS_FEEDS": "https://raw.githubusercontent.com/furkankoykiran/OmniWire-MCP/refs/heads/main/src/config/defaults/feeds.json",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Docker Configuration

```json
{
  "mcpServers": {
    "omniwire": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "RSS_FEEDS",
        "omniwire-mcp"
      ],
      "env": {
        "RSS_FEEDS": "https://raw.githubusercontent.com/furkankoykiran/OmniWire-MCP/refs/heads/main/src/config/defaults/feeds.json"
      }
    }
  }
}
```

---

## 🛠 Capabilities

### Tools

| Tool | Description | Arguments |
|------|-------------|-----------|
| `fetch-news` | Smat fetcher with Sentinel protection | `filter` (string), `sourceId` (string), `limit` (number) |
| `check-health` | Diagnostic report for sources | `sourceId` (optional) |
| `refresh-config` | Force reload of remote config | None |
| `reset-source` | Manually reset a circuit breaker | `sourceId` (string) |

### Resources

| URI | Description |
|-----|-------------|
| `news://all` | Aggregated feed from all healthy sources |
| `news://source/{id}` | Live feed from a specific source |
| `health://sources` | Real-time system health report |
| `config://current` | View active configuration |

### Prompts

| Prompt | Application |
|--------|-------------|
| `summarize-news` | "Give me a digest of topic X" (Uses `fetch-news`) |
| `analyze-sources` | "Diagnose my feed health" (Uses `check-health`) |

---

## ⚙️ Configuration Schema

The configuration JSON file should match the following schema:

```json
{
  "sources": [
    {
      "id": "tech-crunch",
      "name": "TechCrunch",
      "url": "https://techcrunch.com/feed/",
      "type": "rss",
      "enabled": true
    }
  ],
  "configPollIntervalMs": 60000,
  "requestTimeoutMs": 10000,
  "sentinel": {
    "failureThreshold": 3,
    "recoveryTimeoutMs": 60000
  }
}
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to set up your development environment and submit Pull Requests.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
