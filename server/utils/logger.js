const winston = require('winston');

// Load environment variables first
require('./load-env');

// Create base logger configuration
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Log errors to file
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Log everything to combined file
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB  
      maxFiles: 5
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  const enabledServices = process.env.LOG_SERVICES?.split(',').map(s => s.trim()) || [];
  
  // Custom transport that implements the filtering logic
  class FilteredConsoleTransport extends winston.transports.Console {
    log(info, callback) {
      // Filter by service if LOG_SERVICES is set
      if (enabledServices.length > 0 && !enabledServices.includes(info.service)) {
        return callback(null, true); // Skip this log
      }
      
      // Call the parent log method
      super.log(info, callback);
    }
  }
  
  baseLogger.add(new FilteredConsoleTransport({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        // Color the service name
        const colors = {
          server: '\x1b[36m',    // cyan
          workflow: '\x1b[32m',   // green
          mcp: '\x1b[35m',        // magenta
          database: '\x1b[34m',   // blue
          polling: '\x1b[33m',    // yellow
          files: '\x1b[31m',      // red
          parsing: '\x1b[37m',    // white
          manager: '\x1b[95m'     // bright magenta
        };
        
        const serviceColor = colors[service] || '\x1b[37m';
        const reset = '\x1b[0m';
        
        // Color the log level
        const levelColors = {
          error: '\x1b[31m',   // red
          warn: '\x1b[33m',    // yellow
          info: '\x1b[32m',    // green
          debug: '\x1b[36m',   // cyan
          verbose: '\x1b[35m'  // magenta
        };
        
        const levelColor = levelColors[level] || '\x1b[37m';
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        
        return `${timestamp} ${serviceColor}[${service?.toUpperCase() || 'UNKNOWN'}]${reset} ${levelColor}${level}${reset}: ${message}${metaStr}`;
      })
    )
  }));
}

// Create service-specific child loggers
const loggers = {
  server: baseLogger.child({ service: 'server' }),
  workflow: baseLogger.child({ service: 'workflow' }),
  mcp: baseLogger.child({ service: 'mcp' }),
  database: baseLogger.child({ service: 'database' }),
  polling: baseLogger.child({ service: 'polling' }),
  files: baseLogger.child({ service: 'files' }),
  parsing: baseLogger.child({ service: 'parsing' }),
  manager: baseLogger.child({ service: 'manager' })
};

module.exports = loggers;