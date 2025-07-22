const fs = require('fs');
const path = require('path');

function loadEnv(filePath = './.env') {
  // Check if we're in production (Railway)
  if (process.env.RAILWAY_PROJECT_NAME) {
    console.log('Production environment detected (Railway) - using platform environment variables');
    return;
  }
  
  try {
    // Read the .env file
    const envFile = fs.readFileSync(filePath, 'utf8');
    
    // Split into lines and process each one
    const lines = envFile.split('\n');
    
    lines.forEach((line, index) => {
      // Skip empty lines and comments
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }
      
      // Parse key=value pairs
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) {
        console.warn(`Warning: Skipping malformed line ${index + 1}: ${line}`);
        return;
      }
      
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();
      
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      
      // Set the environment variable
      process.env[key] = cleanValue;
    });
    
    console.log(`Successfully loaded environment variables from ${filePath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Error: .env file not found at ${filePath}`);
    } else {
      console.error(`Error reading .env file: ${error.message}`);
    }
    process.exit(1);
  }
}

// Load the .env file
loadEnv();

// Optional: Export the function for use in other modules
module.exports = { loadEnv };