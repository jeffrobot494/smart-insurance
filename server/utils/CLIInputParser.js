const { parsing: logger } = require('./logger');

class CLIInputParser {
  constructor() {
    this.args = process.argv;
  }

  getWorkflowFilename() {
    return this.args[2];
  }

  parseUserInputs() {
    const inputs = {};
    // Start from index 3 (skip node, script, filename)
    for (let i = 3; i < this.args.length; i++) {
      const arg = this.args[i];
      if (arg.includes(':')) {
        const [key, value] = arg.split(':');
        inputs[key] = value;
      }
    }
    return inputs;
  }

  showUsage() {
    logger.error('❌ Please specify a workflow filename');
    logger.info('Usage: node Manager.js <workflow-filename> [key:value] [key:value]...');
    logger.info('Example: node Manager.js workflow.json name:"Blackstone Group" location:"New York"');
  }

  hasWorkflowFilename() {
    return !!this.getWorkflowFilename();
  }
}

module.exports = CLIInputParser;