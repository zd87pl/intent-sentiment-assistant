# Sidecar Desktop App

Tauri-based desktop application for the Sidecar AI Communication Assistant. Provides deeper OAuth integration, encrypted local storage, and native system integration.

## Features

- **Encrypted Storage**: SQLite with SQLCipher for secure local data
- **OAuth Integrations**: Native Slack, Gmail, and Zoom authentication
- **System Keychain**: Secure credential storage
- **Local LLM**: Ollama integration for on-device analysis
- **Cloud LLM**: Claude API with automatic PII anonymization

## Prerequisites

### System Requirements

- **Node.js** 18+ with pnpm
- **Rust** (latest stable)
- **Platform-specific dependencies** (see below)

### macOS

```bash
xcode-select --install
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Linux (Fedora)

```bash
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libxdo-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

### Windows

- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

## Installation

```bash
# Install dependencies
pnpm install

# Development mode with hot reload
pnpm tauri dev

# Production build
pnpm tauri build
```

## Environment Variables

Create a `.env` file in the sidecar directory:

```env
# Slack OAuth (optional - for Slack integration)
VITE_SLACK_CLIENT_ID=your_slack_client_id

# Gmail OAuth (optional - for Gmail integration)
VITE_GMAIL_CLIENT_ID=your_gmail_client_id

# Zoom OAuth (optional - for Zoom integration)
VITE_ZOOM_CLIENT_ID=your_zoom_client_id
```

## Project Structure

```
sidecar/
├── src/
│   ├── main/                 # Backend services
│   │   ├── database/         # SQLite + SQLCipher
│   │   │   ├── schema.ts     # Database schema
│   │   │   ├── encryption.ts # Encryption utilities
│   │   │   └── index.ts      # Database service
│   │   ├── integrations/     # OAuth integrations
│   │   │   ├── slack.ts      # Slack API
│   │   │   ├── gmail.ts      # Gmail API
│   │   │   └── zoom.ts       # Zoom API
│   │   └── analysis/         # LLM analysis
│   │       ├── local-llm.ts  # Ollama integration
│   │       ├── cloud-llm.ts  # Claude API
│   │       └── anonymizer.ts # PII removal
│   │
│   ├── renderer/             # React frontend
│   │   ├── components/       # UI components
│   │   │   ├── SituationList.tsx
│   │   │   ├── SituationDetail.tsx
│   │   │   ├── StakeholderMap.tsx
│   │   │   ├── Timeline.tsx
│   │   │   └── Brief.tsx
│   │   ├── stores/           # Zustand state
│   │   │   ├── situationStore.ts
│   │   │   └── integrationStore.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   └── shared/               # Shared types
│       └── types.ts
│
├── src-tauri/                # Rust backend
│   ├── src/
│   │   └── lib.rs           # Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Development

### Available Scripts

```bash
pnpm dev          # Start Vite dev server only
pnpm build        # Build frontend
pnpm tauri dev    # Start full Tauri dev environment
pnpm tauri build  # Create production build
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript checks
```

### Database Schema

The app uses SQLite with SQLCipher encryption. Key tables:

- `situations` - Workplace situations/issues
- `participants` - People involved in situations
- `communications` - Encrypted messages and emails
- `analyses` - AI-generated analysis results
- `integrations` - OAuth connection status
- `settings` - User preferences
- `audit_log` - Activity tracking

### Adding a New Integration

1. Create integration file in `src/main/integrations/`
2. Add OAuth flow handlers
3. Register Tauri commands in `src-tauri/src/lib.rs`
4. Update integration store in `src/renderer/stores/`

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

## Troubleshooting

### Rust Not Found

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### WebKit Errors on Linux

Make sure you have the correct webkit2gtk version installed for your distribution.

### Build Fails on Windows

Ensure Visual Studio Build Tools are properly installed with the "Desktop development with C++" workload.

## Security

- All encryption keys derived from user password
- Database encrypted at rest with SQLCipher
- OAuth tokens stored in system keychain
- No data leaves device without explicit action
