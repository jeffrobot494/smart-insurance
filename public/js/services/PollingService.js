// Smart Insurance - Generic Polling Service

class PollingService {
    constructor() {
        this.pollers = new Map(); // pollerId -> { interval, callback, active }
        this.defaultInterval = 3000; // 3 seconds
    }
    
    /**
     * Start polling with a unique ID
     * @param {string} pollerId - Unique identifier for this poller
     * @param {Function} callback - Function to call on each poll
     * @param {number} intervalMs - Polling interval in milliseconds
     */
    startPolling(pollerId, callback, intervalMs = this.defaultInterval) {
        // Stop any existing poller with this ID
        this.stopPolling(pollerId);
        
        // Start new interval
        const interval = setInterval(async () => {
            try {
                await callback();
            } catch (error) {
                console.error(`Polling error for ${pollerId}:`, error);
            }
        }, intervalMs);
        
        // Store poller info
        this.pollers.set(pollerId, {
            interval,
            callback,
            intervalMs,
            active: true
        });
        
        console.log(`PollingService: Started polling ${pollerId} every ${intervalMs}ms`);
    }
    
    /**
     * Stop polling for a specific ID
     * @param {string} pollerId - Poller ID to stop
     */
    stopPolling(pollerId) {
        const poller = this.pollers.get(pollerId);
        if (poller) {
            clearInterval(poller.interval);
            this.pollers.delete(pollerId);
            console.log(`PollingService: Stopped polling ${pollerId}`);
        }
    }
    
    /**
     * Stop all active pollers
     */
    stopAll() {
        console.log(`PollingService: Stopping all ${this.pollers.size} active pollers`);
        this.pollers.forEach((poller, pollerId) => {
            clearInterval(poller.interval);
        });
        this.pollers.clear();
    }
    
    /**
     * Check if a poller is active
     */
    isPolling(pollerId) {
        return this.pollers.has(pollerId);
    }
    
    /**
     * Get info about active pollers (for debugging)
     */
    getActivePollers() {
        const info = {};
        this.pollers.forEach((poller, pollerId) => {
            info[pollerId] = {
                intervalMs: poller.intervalMs,
                active: poller.active
            };
        });
        return info;
    }
}

// Make PollingService available globally
window.PollingService = PollingService;