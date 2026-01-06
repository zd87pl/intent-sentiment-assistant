#!/bin/bash
# Sidecar Setup Script
# Installs dependencies and sets up the development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print helpers
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "========================================"
echo "  Sidecar Setup Script"
echo "========================================"
echo ""

# Check for required tools
check_requirements() {
    info "Checking requirements..."

    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        success "Node.js found: $NODE_VERSION"
    else
        error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    fi

    # Check pnpm
    if command -v pnpm &> /dev/null; then
        PNPM_VERSION=$(pnpm -v)
        success "pnpm found: $PNPM_VERSION"
    else
        warn "pnpm not found. Installing..."
        npm install -g pnpm
        success "pnpm installed"
    fi

    # Check Ollama (optional)
    if command -v ollama &> /dev/null; then
        success "Ollama found"
        OLLAMA_INSTALLED=true
    else
        warn "Ollama not found. Local LLM features will not work."
        warn "Install from: https://ollama.ai"
        OLLAMA_INSTALLED=false
    fi

    echo ""
}

# Setup Chrome Extension
setup_extension() {
    info "Setting up Chrome Extension..."

    cd "$PROJECT_ROOT/extension"

    # Create icons directory if it doesn't exist
    mkdir -p public/icons

    # Check if icons exist
    if [ ! -f "public/icons/icon48.png" ]; then
        warn "Extension icons not found. Creating placeholder icons..."
        # Create simple placeholder icons using ImageMagick if available
        if command -v convert &> /dev/null; then
            for size in 16 32 48 128; do
                convert -size ${size}x${size} xc:#4A90D9 \
                    -gravity center -pointsize $((size/2)) -fill white \
                    -annotate 0 "S" "public/icons/icon${size}.png" 2>/dev/null || true
            done
            success "Created placeholder icons"
        else
            warn "ImageMagick not found. Please add icon files manually:"
            warn "  - public/icons/icon16.png"
            warn "  - public/icons/icon32.png"
            warn "  - public/icons/icon48.png"
            warn "  - public/icons/icon128.png"
        fi
    else
        success "Extension icons found"
    fi

    success "Chrome Extension ready!"
    echo ""
    echo "  To install the extension:"
    echo "  1. Open Chrome and go to chrome://extensions/"
    echo "  2. Enable 'Developer mode'"
    echo "  3. Click 'Load unpacked'"
    echo "  4. Select: $PROJECT_ROOT/extension"
    echo ""
}

# Setup Sidecar Desktop App
setup_sidecar() {
    info "Setting up Sidecar Desktop App..."

    cd "$PROJECT_ROOT/sidecar"

    # Install dependencies
    info "Installing dependencies..."
    pnpm install

    # Check for Rust (required for Tauri)
    if command -v rustc &> /dev/null; then
        RUST_VERSION=$(rustc --version)
        success "Rust found: $RUST_VERSION"
    else
        warn "Rust not found. Installing..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
        success "Rust installed"
    fi

    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        info "Creating .env file..."
        cat > .env << 'EOF'
# Sidecar Environment Variables
# Uncomment and fill in to enable integrations

# Slack OAuth (optional)
# VITE_SLACK_CLIENT_ID=your_slack_client_id

# Gmail OAuth (optional)
# VITE_GMAIL_CLIENT_ID=your_gmail_client_id

# Zoom OAuth (optional)
# VITE_ZOOM_CLIENT_ID=your_zoom_client_id
EOF
        success "Created .env file"
    fi

    success "Sidecar Desktop App ready!"
    echo ""
    echo "  To run in development mode:"
    echo "  cd sidecar && pnpm tauri dev"
    echo ""
}

# Setup Ollama
setup_ollama() {
    if [ "$OLLAMA_INSTALLED" = true ]; then
        info "Setting up Ollama..."

        # Check if Ollama is running
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            success "Ollama is running"
        else
            info "Starting Ollama..."
            ollama serve &
            sleep 2
        fi

        # Check if llama3 model exists
        if ollama list 2>/dev/null | grep -q "llama3"; then
            success "llama3 model found"
        else
            info "Pulling llama3:8b model (this may take a while)..."
            ollama pull llama3:8b
            success "llama3:8b model downloaded"
        fi

        echo ""
    fi
}

# Main setup flow
main() {
    check_requirements
    setup_extension
    setup_sidecar
    setup_ollama

    echo ""
    echo "========================================"
    echo "  Setup Complete!"
    echo "========================================"
    echo ""
    echo "Quick Start:"
    echo ""
    echo "  1. Load the Chrome Extension:"
    echo "     chrome://extensions/ → Load unpacked → select extension/"
    echo ""
    echo "  2. Start Ollama (if not running):"
    echo "     ollama serve"
    echo ""
    echo "  3. (Optional) Run the Desktop App:"
    echo "     cd sidecar && pnpm tauri dev"
    echo ""
    success "Happy coding!"
}

# Run main
main "$@"
