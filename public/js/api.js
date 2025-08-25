// Smart Insurance - API Client

class PipelineAPI {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
    }

    // HTTP Helper Methods
    async makeRequest(url, options = {}) {
        const fullUrl = this.baseURL + url;
        const requestOptions = {
            headers: { ...this.defaultHeaders, ...options.headers },
            ...options
        };

        try {
            console.log(`API Request: ${requestOptions.method || 'GET'} ${fullUrl}`);
            
            const response = await fetch(fullUrl, requestOptions);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            console.log(`API Response: ${response.status}`, data);
            return data;
        } catch (error) {
            console.error('API Request failed:', error);
            
            // Handle network errors gracefully
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error: Unable to connect to server. Please check your connection.');
            }
            
            throw error;
        }
    }

    async get(url, options = {}) {
        return this.makeRequest(url, { method: 'GET', ...options });
    }

    async post(url, data, options = {}) {
        return this.makeRequest(url, {
            method: 'POST',
            body: JSON.stringify(data),
            ...options
        });
    }

    async put(url, data, options = {}) {
        return this.makeRequest(url, {
            method: 'PUT',
            body: JSON.stringify(data),
            ...options
        });
    }

    async delete(url, options = {}) {
        return this.makeRequest(url, { method: 'DELETE', ...options });
    }

    // Pipeline Management Methods
    async createPipeline(firmName) {
        console.log('Creating pipeline for firm:', firmName);
        return this.post('/api/pipeline', { firm_name: firmName });
    }

    async getPipeline(pipelineId) {
        console.log('Getting pipeline:', pipelineId);
        return this.get(`/api/pipeline/${pipelineId}`);
    }

    async getAllPipelines(options = {}) {
        const params = new URLSearchParams();
        
        // Add pagination parameters
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        
        // Add filtering parameters
        if (options.status) params.append('status', options.status);
        if (options.firm_name) params.append('firm_name', options.firm_name);
        
        const queryString = params.toString();
        const url = `/api/pipeline${queryString ? '?' + queryString : ''}`;
        
        console.log('Getting all pipelines with options:', options);
        return this.get(url);
    }


    async deletePipeline(pipelineId) {
        console.log('Deleting pipeline:', pipelineId);
        return this.delete(`/api/pipeline/${pipelineId}`);
    }

    // Workflow Step Methods
    async runResearch(pipelineId) {
        console.log('Running research for pipeline:', pipelineId);
        return this.post(`/api/pipeline/${pipelineId}/research`);
    }

    async runLegalResolution(pipelineId) {
        console.log('Running legal resolution for pipeline:', pipelineId);
        return this.post(`/api/pipeline/${pipelineId}/legal-resolution`);
    }

    async runDataExtraction(pipelineId) {
        console.log('Running data extraction for pipeline:', pipelineId);
        return this.post(`/api/pipeline/${pipelineId}/data-extraction`);
    }

    async retryStep(pipelineId, step) {
        console.log(`Retrying ${step} for pipeline:`, pipelineId);
        return this.post(`/api/pipeline/${pipelineId}/retry/${step}`);
    }

    // Company Management Methods
    async updateCompanies(pipelineId, companies) {
        console.log('Updating companies for pipeline:', pipelineId, companies);
        
        // Validate companies data
        if (!Array.isArray(companies)) {
            throw new Error('Companies must be an array');
        }

        for (const company of companies) {
            const validation = Utils.validateCompanyData(company);
            if (!validation.valid) {
                throw new Error(`Invalid company data: ${validation.errors.join(', ')}`);
            }
        }

        return this.put(`/api/pipeline/${pipelineId}/companies`, { companies });
    }

    // Status Monitoring Methods
    async getPipelineStatus(pipelineId) {
        console.log('Getting status for pipeline:', pipelineId);
        try {
            const pipeline = await this.getPipeline(pipelineId);
            return {
                success: true,
                status: pipeline.pipeline.status,
                pipeline: pipeline.pipeline
            };
        } catch (error) {
            console.error('Error getting pipeline status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Report Generation Methods (for future use)
    async generateReport(pipelineId, config = {}) {
        console.log('Generating report for pipeline:', pipelineId, 'with config:', config);
        // This will be implemented when report generation endpoint is available
        return this.post(`/api/pipeline/${pipelineId}/report`, config);
    }

    // Batch Operations
    async createMultiplePipelines(firmNames) {
        console.log('Creating multiple pipelines for firms:', firmNames);
        
        const results = [];
        const errors = [];

        for (const firmName of firmNames) {
            try {
                const result = await this.createPipeline(firmName);
                results.push({
                    firmName,
                    success: true,
                    pipeline: result.pipeline
                });
            } catch (error) {
                console.error(`Failed to create pipeline for ${firmName}:`, error);
                errors.push({
                    firmName,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            success: errors.length === 0,
            results,
            errors,
            totalCreated: results.length,
            totalFailed: errors.length
        };
    }

    // Health Check
    async healthCheck() {
        try {
            const response = await this.get('/api/health');
            return {
                success: true,
                status: 'healthy',
                data: response
            };
        } catch (error) {
            return {
                success: false,
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    // Utility Methods
    async testConnection() {
        console.log('Testing API connection...');
        try {
            await this.healthCheck();
            console.log('✅ API connection successful');
            return true;
        } catch (error) {
            console.error('❌ API connection failed:', error.message);
            return false;
        }
    }

    // Pipeline Status Polling (for real-time updates)
    startStatusPolling(pipelineId, callback, interval = 5000) {
        console.log(`Starting status polling for pipeline ${pipelineId} every ${interval}ms`);
        
        const pollStatus = async () => {
            try {
                const statusResult = await this.getPipelineStatus(pipelineId);
                if (statusResult.success && callback) {
                    callback(statusResult.pipeline);
                }
            } catch (error) {
                console.error('Status polling error:', error);
                if (callback) {
                    callback(null, error);
                }
            }
        };

        // Poll immediately, then set interval
        pollStatus();
        const intervalId = setInterval(pollStatus, interval);

        // Return function to stop polling
        return () => {
            console.log(`Stopping status polling for pipeline ${pipelineId}`);
            clearInterval(intervalId);
        };
    }

    // Error Recovery Methods
    async retryFailedRequest(requestFunction, maxRetries = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await requestFunction();
            } catch (error) {
                console.warn(`Request attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
        }
    }
}

// Make PipelineAPI available globally
window.PipelineAPI = PipelineAPI;