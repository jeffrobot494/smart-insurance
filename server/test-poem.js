const Anthropic = require('@anthropic-ai/sdk');
require('./load-env');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testPoem() {
  try {
    console.log('🚀 Requesting poem from Claude...');
    
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: 'Write a short 3-line poem about fruit. Make it rhyme.'
      }]
    });

    console.log('✅ Response received:');
    console.log('---');
    console.log(message.content[0].text);
    console.log('---');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPoem();