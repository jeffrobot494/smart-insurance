class NotificationManager {
    constructor() {
        this.container = null;
        this.createNotificationContainer();
    }

    createNotificationContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
        this.container = container;
    }

    showError(message) {
        this.createNotification(message, 'error');
    }

    showSuccess(message) {
        this.createNotification(message, 'success');
    }

    createNotification(message, type) {
        const notification = document.createElement('div');
        notification.textContent = message;
        
        const baseStyles = `
            padding: 12px 20px;
            margin-bottom: 10px;
            border-radius: 4px;
            color: white;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        const typeStyles = {
            success: 'background: #4CAF50;',
            error: 'background: #f44336;'
        };
        
        notification.style.cssText = baseStyles + typeStyles[type];
        
        this.container.appendChild(notification);
        
        // Fade in
        setTimeout(() => notification.style.opacity = '1', 10);
        
        // Auto-remove after 3 seconds
        setTimeout(() => this.removeNotification(notification), 3000);
    }

    removeNotification(notification) {
        if (notification && notification.parentNode) {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    showCsvUploadSuccess(firmCount) {
        this.showSuccess(`Successfully loaded ${firmCount} firms from CSV`);
    }

    showCsvUploadError(errorMessage) {
        this.showError(`CSV Upload Failed: ${errorMessage}`);
    }

    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}