// Sidecar Main Process
// Entry point for backend services

// Database
export * from './database';
export * from './database/schema';
export * from './database/encryption';

// Integrations
export * as slack from './integrations/slack';
export * as gmail from './integrations/gmail';
export * as zoom from './integrations/zoom';

// Analysis
export * as localLlm from './analysis/local-llm';
export * as cloudLlm from './analysis/cloud-llm';
export * as anonymizer from './analysis/anonymizer';

// Re-export types
export type * from '../shared/types';
