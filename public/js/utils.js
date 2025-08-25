// Smart Insurance - Utility Functions

const Utils = {
    // DOM Helper Functions
    createElement(tag, className = '', attributes = {}) {
        const element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        Object.keys(attributes).forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
        return element;
    },

    findElement(selector) {
        return document.querySelector(selector);
    },

    findElements(selector) {
        return document.querySelectorAll(selector);
    },

    // Data Formatting Functions
    formatDate(dateString) {
        const date = new Date(dateString);
        const options = { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        return date.toLocaleDateString('en-US', options);
    },

    formatCurrency(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    },

    formatNumber(number) {
        if (typeof number !== 'number') {
            number = parseInt(number) || 0;
        }
        return number.toLocaleString('en-US');
    },

    // Validation Functions
    validateFirmNames(input) {
        if (!input || typeof input !== 'string') {
            return { valid: false, error: 'Please enter firm names' };
        }

        const trimmed = input.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'Please enter at least one firm name' };
        }

        const firmNames = trimmed.split(',')
            .map(name => name.trim())
            .filter(name => name.length > 0);

        if (firmNames.length === 0) {
            return { valid: false, error: 'Please enter valid firm names separated by commas' };
        }

        return { valid: true, firmNames };
    },

    validateCompanyData(company) {
        const errors = [];

        if (!company.name || company.name.trim().length === 0) {
            errors.push('Company name is required');
        }

        if (company.name && company.name.trim().length > 100) {
            errors.push('Company name is too long (max 100 characters)');
        }

        if (company.legal_entity_name && company.legal_entity_name.length > 150) {
            errors.push('Legal entity name is too long (max 150 characters)');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    // String Helper Functions
    capitalize(str) {
        if (!str || typeof str !== 'string') return str;
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    capitalizeWords(str) {
        if (!str || typeof str !== 'string') return str;
        return str.split(' ')
            .map(word => this.capitalize(word))
            .join(' ');
    },

    // Array Helper Functions
    removeItem(array, index) {
        if (!Array.isArray(array) || index < 0 || index >= array.length) {
            return array;
        }
        return [...array.slice(0, index), ...array.slice(index + 1)];
    },

    updateItem(array, index, newItem) {
        if (!Array.isArray(array) || index < 0 || index >= array.length) {
            return array;
        }
        return [...array.slice(0, index), newItem, ...array.slice(index + 1)];
    },

    // Status Helper Functions
    getStatusDisplay(status) {
        const statusMap = {
            'pending': { text: 'Pending', class: 'status-pending' },
            'research_running': { text: 'Research Running', class: 'status-running' },
            'research_complete': { text: 'Research Complete', class: 'status-complete' },
            'legal_resolution_running': { text: 'Legal Resolution Running', class: 'status-running' },
            'legal_resolution_complete': { text: 'Legal Resolution Complete', class: 'status-complete' },
            'data_extraction_running': { text: 'Data Extraction Running', class: 'status-running' },
            'data_extraction_complete': { text: 'Data Extraction Complete', class: 'status-complete' },
            'failed': { text: 'Failed', class: 'status-failed' }
        };

        return statusMap[status] || { text: status, class: 'status-pending' };
    },

    // Display Rules - What should be shown at each pipeline status
    DisplayRules: {
        shouldShowConfidenceBadge(pipelineStatus) {
            return ['legal_resolution_complete', 'data_extraction_running', 
                    'data_extraction_complete', 'data_extraction_failed'].includes(pipelineStatus);
        },
        
        shouldShowLegalEntityName(pipelineStatus) {
            return ['legal_resolution_complete', 'data_extraction_running',
                    'data_extraction_complete', 'data_extraction_failed'].includes(pipelineStatus);
        },
        
        shouldShowForm5500Data(pipelineStatus) {
            return pipelineStatus === 'data_extraction_complete';
        },
        
        isCompanyEditable(pipelineStatus) {
            return ['research_complete', 'legal_resolution_complete', 'research_failed', 'legal_resolution_failed', 'data_extraction_failed'].includes(pipelineStatus);
        },

        shouldShowExitedCheckbox(pipelineStatus) {
            return ['research_complete', 'legal_resolution_complete', 'research_failed', 'legal_resolution_failed', 'data_extraction_failed'].includes(pipelineStatus);
        },

        shouldShowRemoveButton(pipelineStatus) {
            return ['research_complete', 'legal_resolution_complete', 'research_failed', 'legal_resolution_failed', 'data_extraction_failed'].includes(pipelineStatus);
        },

        // Get complete display configuration for a status
        getCompanyDisplayConfig(pipelineStatus) {
            return {
                showConfidenceBadge: this.shouldShowConfidenceBadge(pipelineStatus),
                showLegalEntityName: this.shouldShowLegalEntityName(pipelineStatus),
                showForm5500Data: this.shouldShowForm5500Data(pipelineStatus),
                isEditable: this.isCompanyEditable(pipelineStatus),
                showExitedCheckbox: this.shouldShowExitedCheckbox(pipelineStatus),
                showRemoveButton: this.shouldShowRemoveButton(pipelineStatus)
            };
        }
    },

    // File Helper Functions
    parseCsvContent(csvContent) {
        try {
            const lines = csvContent.split('\n');
            const firmNames = [];

            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    // Handle CSV with commas in quotes
                    const names = this.parseCSVLine(trimmed);
                    firmNames.push(...names);
                }
            });

            return firmNames.filter(name => name.length > 0);
        } catch (error) {
            console.error('Error parsing CSV:', error);
            return [];
        }
    },

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result.filter(item => item.length > 0);
    },

    // Event Helper Functions
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Local Storage Helper Functions
    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    },

    loadFromStorage(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return null;
        }
    },

    removeFromStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing from localStorage:', error);
            return false;
        }
    },

    // Error Helper Functions
    createErrorMessage(error, defaultMessage = 'An unexpected error occurred') {
        if (typeof error === 'string') {
            return error;
        }
        
        if (error && error.message) {
            return error.message;
        }
        
        return defaultMessage;
    },

    // Loading Helper Functions
    showLoading(text = 'Processing...') {
        const overlay = Utils.findElement('#loading-overlay');
        const textElement = Utils.findElement('.loading-text');
        
        if (overlay) {
            if (textElement) {
                textElement.textContent = text;
            }
            overlay.classList.add('show');
        }
    },

    hideLoading() {
        const overlay = Utils.findElement('#loading-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }
};

// Make Utils available globally
window.Utils = Utils;