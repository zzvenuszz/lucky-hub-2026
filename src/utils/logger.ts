
/**
 * Utility for system-wide logging with consistent prefixes.
 */
export const logger = {
  info: (module: string, message: string) => {
    console.log(`[${module}] ${message}`);
  },
  error: (module: string, message: string, error?: any) => {
    console.error(`[${module}] ERROR: ${message}`, error?.message || error || '');
  },
  warn: (module: string, message: string) => {
    console.warn(`[${module}] WARN: ${message}`);
  },
  http: (method: string, path: string, statusCode: number, duration: number, ip: string) => {
    console.log(`[HTTP] ${method} ${path} - ${statusCode} (${duration}ms) from ${ip}`);
  },
  ws: (message: string) => {
    console.log(`[WS] ${message}`);
  }
};
