// Smart Insurance - Enhanced Notification Manager Component

class NotificationManager {
    constructor() {
        this.notifications = new Map(); // notificationId -> notification element
        this.nextId = 1;
        this.container = null;
        this.init();
    }
    
    init() {
        // Create notification container if it doesn't exist
        this.container = document.getElementById('notification-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notification-container';
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        }
    }
    
    /**
     * Show an error notification with detailed pipeline error info
     */
    showPipelineError(pipelineId, failureStatus, pipeline, errorDetails) {
        const workflowName = this.getWorkflowName(failureStatus);
        const title = `${workflowName} Failed`;
        
        let content = `Pipeline: ${pipeline.firm_name}\n`;
        
        if (errorDetails) {
            content += [
                `API: ${errorDetails.api}`,
                `Error: ${errorDetails.message}`,
                `Time: ${new Date(errorDetails.time).toLocaleString()}`,
                `\nSuggestion: ${this.getSuggestedAction(errorDetails.type)}`
            ].join('\n');
        } else {
            content += 'An error occurred. Please check the pipeline and try again.';
        }
        
        return this.show({
            type: 'error',
            title: title,
            content: content,
            persistent: true
        });
    }
    
    /**
     * Show a notification
     */
    show(options = {}) {
        const {
            type = 'info',
            title = 'Notification',
            content = '',
            duration = null, // null = persistent
            persistent = false
        } = options;
        
        const notificationId = this.nextId++;
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.dataset.notificationId = notificationId;
        
        notification.innerHTML = `
            <div class="notification-header">
                <span class="notification-title">${title}</span>
                <button class="notification-close" aria-label="Close">&times;</button>
            </div>
            <div class="notification-content">${content.replace(/\n/g, '<br>')}</div>
        `;
        
        // Add close button event listener
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => this.hide(notificationId));
        
        // Add to container
        this.container.appendChild(notification);
        this.notifications.set(notificationId, notification);
        
        // Auto-hide if not persistent
        if (!persistent && duration) {
            setTimeout(() => this.hide(notificationId), duration);
        }
        
        // Animate in
        requestAnimationFrame(() => {
            notification.classList.add('notification-show');
        });
        
        return notificationId;
    }
    
    /**
     * Hide a notification
     */
    hide(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (notification) {
            notification.classList.remove('notification-show');
            notification.classList.add('notification-hide');
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                this.notifications.delete(notificationId);
            }, 300);
        }
    }
    
    /**
     * Hide all notifications
     */
    hideAll() {
        this.notifications.forEach((notification, id) => {
            this.hide(id);
        });
    }
    
    /**
     * Show success notification
     */
    showSuccess(title, content = '', options = {}) {
        return this.show({
            type: 'success',
            title,
            content,
            duration: options.duration || 4000,
            ...options
        });
    }
    
    /**
     * Show error notification
     */
    showError(title, content = '', options = {}) {
        return this.show({
            type: 'error',
            title,
            content,
            persistent: true,
            ...options
        });
    }
    
    /**
     * Show warning notification
     */
    showWarning(title, content = '', options = {}) {
        return this.show({
            type: 'warning',
            title,
            content,
            duration: options.duration || 6000,
            ...options
        });
    }
    
    /**
     * Show info notification
     */
    showInfo(title, content = '', options = {}) {
        return this.show({
            type: 'info',
            title,
            content,
            duration: options.duration || 4000,
            ...options
        });
    }
    
    // Helper methods
    getWorkflowName(failureStatus) {
        const workflowMap = {
            'research_failed': 'Research',
            'legal_resolution_failed': 'Legal Resolution'
            // data_extraction_failed not included - programming errors don't use notifications
        };
        return workflowMap[failureStatus] || 'Workflow';
    }
    
    getSuggestedAction(errorType) {
        const suggestions = {
            'balance_low': 'Please check your API credits and add more if needed.',
            'credits_exhausted': 'Please check your API credits and add more if needed.',
            'rate_limit': 'Please wait a few minutes before retrying.',
            'server_error': 'This appears to be a temporary server issue. Please try again.',
            'authorization_failed': 'Please check your API keys in settings.',
            'timeout_error': 'The request timed out. Please check your connection and try again.'
        };
        return suggestions[errorType] || 'Please check your API configuration and try again.';
    }

    // Legacy compatibility methods (for gradual migration)
    showCsvUploadSuccess(firmCount) {
        this.showSuccess('CSV Upload Success', `Successfully loaded ${firmCount} firms from CSV`);
    }

    showCsvUploadError(errorMessage) {
        this.showError('CSV Upload Failed', errorMessage);
    }

    clear() {
        this.hideAll();
    }
}

// Make NotificationManager available globally
window.NotificationManager = NotificationManager;