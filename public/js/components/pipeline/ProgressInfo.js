// Smart Insurance - Progress Info Component

class ProgressInfo extends BaseComponent {
    constructor(pipeline, callbacks = {}) {
        super(pipeline, callbacks);
        this.pipeline = pipeline;
    }
    
    render() {
        // Only render if pipeline is running
        if (!this.isPipelineRunning(this.pipeline.status)) {
            this.element = this.createElement('div');
            this.element.style.display = 'none';
            this.isRendered = true;
            return this.element;
        }
        
        this.element = this.createElement('div', 'progress-section');
        this.element.style.margin = '15px 0';
        this.element.innerHTML = `
            <div class="stat">Progress: <span class="stat-value">Processing...</span></div>
            <div class="stat">Estimated time: <span class="stat-value">2-5 minutes</span></div>
        `;
        
        this.isRendered = true;
        return this.element;
    }
    
    isPipelineRunning(status) {
        return status && status.includes('running');
    }
    
    update(pipeline) {
        this.pipeline = pipeline;
        if (this.isRendered && this.element) {
            const shouldShow = this.isPipelineRunning(pipeline.status);
            this.element.style.display = shouldShow ? 'block' : 'none';
        }
    }
}

// Make ProgressInfo available globally
window.ProgressInfo = ProgressInfo;