# Sidecar - AI Management Communication Assistant

An AI-powered tool that helps engineering leaders manage workplace situations by analyzing communication patterns across Slack, Gmail, and Zoom. Built with privacy-first architecture - all sensitive data stays local.

## Overview

Sidecar helps you:
- **Track workplace situations** - Create "case files" for ongoing issues, conflicts, or projects
- **Analyze communication patterns** - Understand tone, intent, and sentiment across conversations
- **Generate actionable briefs** - Get AI-powered summaries with suggested next steps
- **Identify risks early** - Detect disengagement, escalation, or misalignment signals

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐   │
│  │  Popup   │  │ Sidepanel│  │    Content Scripts      │   │
│  │   UI     │  │   UI     │  │  (Slack, Gmail capture) │   │
│  └──────────┘  └──────────┘  └─────────────────────────┘   │
│                         │                                    │
│              ┌──────────▼──────────┐                        │
│              │  Background Worker  │                        │
│              │  (Storage, LLM API) │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (optional sync)
┌─────────────────────────────────────────────────────────────┐
│                    Sidecar Desktop App                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   React UI  │  │  Tauri Core  │  │  SQLite+SQLCipher │   │
│  │  (Renderer) │  │   (Rust)     │  │   (Encrypted DB)  │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│                          │                                   │
│         ┌────────────────┼────────────────┐                 │
│         ▼                ▼                ▼                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐        │
│  │   Slack    │  │   Gmail    │  │     Zoom       │        │
│  │   OAuth    │  │   OAuth    │  │     OAuth      │        │
│  └────────────┘  └────────────┘  └────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
   ┌─────────────┐                ┌─────────────────┐
   │ Local LLM   │                │   Cloud LLM     │
   │  (Ollama)   │                │ (Claude API)    │
   │ Sensitive   │                │ Anonymized data │
   │   data      │                │     only        │
   └─────────────┘                └─────────────────┘
```

## Components

| Component | Description | Status |
|-----------|-------------|--------|
| [Chrome Extension](./extension/) | Main UI for capturing and analyzing communications | Ready |
| [Desktop App](./sidecar/) | Tauri app for deeper OAuth integration | In Development |

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- [Ollama](https://ollama.ai/) for local LLM
- Chrome browser

### 1. Install Ollama (Local LLM)

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama and pull a model
ollama serve &
ollama pull llama3:8b
```

### 2. Install the Chrome Extension

```bash
cd extension

# Load in Chrome:
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the extension/ directory
```

### 3. (Optional) Install the Desktop App

```bash
cd sidecar
pnpm install
pnpm tauri dev
```

## Quick Setup Script

Run the setup script to get started quickly:

```bash
./scripts/setup.sh
```

## Configuration

### Extension Settings

Open the extension sidepanel → Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| Local LLM Endpoint | `http://localhost:11434` | Ollama API endpoint |
| Local LLM Model | `llama3:8b` | Model for analysis |
| Cloud LLM | Disabled | Enable for advanced reasoning |
| Auto Capture | Disabled | Auto-capture Slack/Gmail |

### Privacy

All sensitive data is processed locally:
- Communication content stays on your device
- Only anonymized summaries sent to cloud LLM (if enabled)
- SQLite database encrypted with SQLCipher
- OAuth tokens stored in system keychain

## Usage

### Creating a Situation

1. Click the Sidecar extension icon
2. Click "New Situation"
3. Enter a title (e.g., "Team alignment on Q2 roadmap")
4. Add participants involved

### Capturing Communications

1. Navigate to a Slack channel or Gmail thread
2. Select text you want to capture
3. Click the Sidecar capture button
4. Choose which situation to add it to

### Generating a Brief

1. Open a situation in the sidepanel
2. Click "Generate Brief"
3. Review the AI-generated analysis

## Project Structure

```
intent-sentiment-assistant/
├── extension/                 # Chrome Extension
│   ├── manifest.json
│   ├── src/
│   │   ├── popup/            # Toolbar popup UI
│   │   ├── sidepanel/        # Full management interface
│   │   ├── background/       # Service worker
│   │   ├── content/          # Content scripts
│   │   └── shared/           # Shared utilities
│   └── README.md
│
├── sidecar/                   # Tauri Desktop App
│   ├── src/
│   │   ├── main/             # Backend (database, integrations)
│   │   ├── renderer/         # React frontend
│   │   └── shared/           # Shared types
│   ├── src-tauri/            # Rust backend
│   └── README.md
│
├── scripts/                   # Setup scripts
│   └── setup.sh
│
└── README.md
```

## Development

### Extension Development

```bash
cd extension
# No build step required - vanilla JS
# Edit files and reload extension in chrome://extensions/
```

### Desktop App Development

```bash
cd sidecar
pnpm install
pnpm tauri dev    # Development with hot reload
pnpm tauri build  # Production build
```

## Security & Privacy

- **Local-first**: All PII stays on your device
- **Encrypted storage**: SQLite with SQLCipher
- **Anonymization**: PII removed before cloud API calls
- **Secure OAuth**: Tokens in system keychain
- **No telemetry**: No data sent without explicit action

## License

MIT
