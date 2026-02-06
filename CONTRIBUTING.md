# Contributing to OmniWire-MCP

Thank you for your interest in contributing to **OmniWire-MCP**! We welcome contributions from the community to make this the best news aggregation server for AI.

## 🛠 Development Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/furkankoykiran/OmniWire-MCP.git
    cd OmniWire-MCP
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run in development mode:**
    ```bash
    npm run dev
    ```

## 🧪 Testing

We use [Vitest](https://vitest.dev/) for unit and integration testing.

-   **Run tests:** `npm test`
-   **Run tests with coverage:** `npm test -- --coverage`

Please ensure all tests pass before submitting a Pull Request.

## 📦 Project Structure

-   `src/index.ts`: Application entry point.
-   `src/config/`: Configuration management (ConfigLoader).
-   `src/services/`
    -   `parser/`: UniversalParser and adapters (RSS, JSON, HTML).
    -   `sentinel/`: Circuit Breaker and health monitoring.
-   `src/mcp/`: MCP Server implementation (Resources, Tools, Prompts).

## 📝 Pull Request Guidelines

1.  Fork the repository and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  Ensure your code passes linting (`npm run lint`).
4.  Update documentation if applicable.
5.  Open a Pull Request with a clear title and description.
