/**
 * JSON Download Service
 * Handles JSON file generation and download for pipeline data
 */

class JSONDownloadService {

    /**
     * Download pipeline data as a formatted JSON file
     */
    static downloadJSONFile(pipelineData, firmName) {
        try {
            console.log('Starting JSON download for:', firmName);

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            const safeFirmName = firmName ? firmName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') : 'PE_Firm';
            const filename = `${safeFirmName}_Pipeline_Data_${timestamp}.json`;

            // Create formatted JSON string with proper indentation
            const jsonString = JSON.stringify(pipelineData, null, 2);

            // Create blob with appropriate MIME type
            const blob = new Blob([jsonString], {
                type: 'application/json;charset=utf-8'
            });
            const url = URL.createObjectURL(blob);

            // Create temporary download link
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.style.display = 'none'; // Hide the link

            // Trigger download
            document.body.appendChild(downloadLink);
            downloadLink.click();

            // Cleanup
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);

            console.log(`JSON pipeline data downloaded successfully: ${filename}`);

            return {
                success: true,
                filename: filename,
                size: jsonString.length,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Failed to download JSON file:', error);

            // Provide user-friendly error message
            const userMessage = 'Failed to download JSON file. Please try again or contact support if the problem persists.';

            throw new Error(userMessage);
        }
    }

    /**
     * Validate pipeline data before download
     */
    static validatePipelineData(pipelineData) {
        if (!pipelineData) {
            return { valid: false, error: 'No pipeline data provided' };
        }

        if (typeof pipelineData !== 'object') {
            return { valid: false, error: 'Pipeline data must be an object' };
        }

        // Check for required fields
        const requiredFields = ['pipeline_id', 'firm_name'];
        for (const field of requiredFields) {
            if (!pipelineData.hasOwnProperty(field)) {
                return { valid: false, error: `Missing required field: ${field}` };
            }
        }

        return { valid: true };
    }

    /**
     * Download JSON with validation
     */
    static async downloadJSONWithValidation(pipelineData, firmName) {
        try {
            // Validate data first
            const validation = this.validatePipelineData(pipelineData);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            // Proceed with download
            return this.downloadJSONFile(pipelineData, firmName);

        } catch (error) {
            console.error('JSON download with validation failed:', error);
            throw error;
        }
    }

    /**
     * Get service capabilities and information
     */
    static getCapabilities() {
        return {
            supportedFormats: ['json'],
            features: {
                formatting: true,
                validation: true,
                timestamping: true,
                safeFiling: true
            },
            maxSize: 50 * 1024 * 1024, // 50MB theoretical limit for blob URLs
            browserSupport: {
                download: typeof document !== 'undefined' && document.createElement,
                blobUrls: typeof URL !== 'undefined' && URL.createObjectURL,
                jsonStringify: typeof JSON !== 'undefined' && JSON.stringify
            }
        };
    }
}

// Make available globally
window.JSONDownloadService = JSONDownloadService;