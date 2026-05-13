/**
 * Simple logger utility for Lucky Hub
 */
export interface Logger {
  info: (category: string, message: string) => void;
  error: (category: string, message: string) => void;
  warn: (category: string, message: string) => void;
}

export const logger: Logger = {
  info: (category: string, message: string) => {
    console.log(`[${category}] ${message}`);
  },
  error: (category: string, message: string) => {
    console.error(`[${category}] ERROR: ${message}`);
  },
  warn: (category: string, message: string) => {
    console.warn(`[${category}] WARNING: ${message}`);
  }
};