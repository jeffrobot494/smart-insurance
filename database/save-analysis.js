#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Run the analysis script and save output to file
const outputFile = path.join(__dirname, 'schema-analysis-output.txt');

console.log('📊 Running CSV schema analysis and saving to file...');

const child = spawn('node', [path.join(__dirname, 'analyze-csv-schema.js')]);

let output = '';
let errorOutput = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text); // Show progress
  output += text;
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  process.stderr.write(text); // Show errors
  errorOutput += text;
});

child.on('close', (code) => {
  if (code === 0) {
    // Save output to file
    fs.writeFileSync(outputFile, output);
    console.log(`\n✅ Analysis complete! Output saved to: ${outputFile}`);
    console.log(`📄 File size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);
  } else {
    console.error(`❌ Analysis failed with code ${code}`);
    if (errorOutput) {
      console.error('Error output:', errorOutput);
    }
  }
});

child.on('error', (error) => {
  console.error('❌ Failed to run analysis:', error.message);
});