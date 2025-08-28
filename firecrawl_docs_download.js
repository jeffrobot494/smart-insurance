const { Firecrawl } = require('@mendable/firecrawl-js');
const fs = require('fs');
const path = require('path');

const FIRECRAWL_API_KEY = 'fc-9fb5dae0e7af4504a7bf8ff114dc6309';

class FirecrawlDocsDownloader {
  constructor() {
    this.firecrawl = new Firecrawl({ apiKey: FIRECRAWL_API_KEY });
    this.outputDir = './downloaded_docs';
  }

  async crawlWebsite(url) {
    console.log(`🕷️  Starting crawl of: ${url}`);
    
    try {
      const docs = await this.firecrawl.crawl(url, { limit: 1000 });
      console.log(`✅ Crawl completed! Found ${docs.length} pages`);
      return docs;

    } catch (error) {
      console.error('❌ Error crawling website:', error.message);
      throw error;
    }
  }

  async saveResults(docs) {
    console.log(`💾 Saving ${docs.length} pages to ${this.outputDir}`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Save individual pages
    const savedPages = [];
    for (let i = 0; i < docs.length; i++) {
      const page = docs[i];
      const fileName = this.generateFileName(page.url || `page_${i}`);
      const filePath = path.join(this.outputDir, fileName);

      const pageData = {
        url: page.url,
        title: page.metadata?.title || 'Unknown Title',
        content: page.markdown || page.content || '',
        metadata: page.metadata || {},
        crawledAt: new Date().toISOString()
      };

      fs.writeFileSync(filePath, JSON.stringify(pageData, null, 2));
      savedPages.push({
        url: pageData.url,
        title: pageData.title,
        file: fileName
      });

      console.log(`  ✓ Saved: ${pageData.title} -> ${fileName}`);
    }

    // Save index file
    const indexPath = path.join(this.outputDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      crawledAt: new Date().toISOString(),
      totalPages: savedPages.length,
      baseUrl: 'https://docs.blamejared.com/1.20.1/en/',
      pages: savedPages
    }, null, 2));

    console.log(`📋 Index saved to: ${indexPath}`);
    console.log(`🎉 Successfully downloaded ${savedPages.length} pages!`);

    return savedPages;
  }

  generateFileName(url) {
    // Convert URL to safe filename
    return url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 100) + '.json';
  }
}

async function main() {
  const downloader = new FirecrawlDocsDownloader();
  
  try {
    const docs = await downloader.crawlWebsite('https://docs.blamejared.com/1.20.1/en/');
    await downloader.saveResults(docs);
  } catch (error) {
    console.error('💥 Download failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = FirecrawlDocsDownloader;