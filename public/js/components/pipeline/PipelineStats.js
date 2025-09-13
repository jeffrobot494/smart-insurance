// Smart Insurance - Pipeline Stats Component

class PipelineStats extends BaseComponent {
    constructor(pipeline, callbacks = {}) {
        super(pipeline, callbacks);
        this.pipeline = pipeline;
    }
    
    render() {
        const stats = this.calculatePipelineStats(this.pipeline);
        
        this.element = this.createElement('div', 'stats-row');
        this.element.innerHTML = this.renderStats(stats);
        
        this.isRendered = true;
        return this.element;
    }
    
    calculatePipelineStats(pipeline) {
        const companies = pipeline.companies || [];
        let companiesWithData = 0;
        let totalParticipants = 0;
        let totalCharges = 0;
        let totalBrokerageFees = 0;
        
        companies.forEach(company => {
            if (company.form5500_data) {
                companiesWithData++;
                totalParticipants += company.form5500_data.active_participants || 0;
                totalCharges += company.form5500_data.total_charges || 0;
                totalBrokerageFees += company.total_brokerage_fees || 0;
            }
        });
        
        return {
            totalCompanies: companies.length,
            companiesWithData,
            totalParticipants,
            totalCharges,
            totalBrokerageFees
        };
    }
    
    renderStats(stats) {
        let statsHtml = '';
        
        if (stats.totalCompanies > 0) {
            statsHtml += `<div class="stat">Portfolio companies: <span class="stat-value">${stats.totalCompanies}</span></div>`;
            
            if (stats.companiesWithData > 0) {
                statsHtml += `<div class="stat">With 5500 data: <span class="stat-value">${stats.companiesWithData}</span></div>`;
                
                if (stats.totalParticipants > 0) {
                    statsHtml += `<div class="stat">Active participants: <span class="stat-value">${Utils.formatNumber(stats.totalParticipants)}</span></div>`;
                }
                
                if (stats.totalCharges > 0) {
                    statsHtml += `<div class="stat">Total charges: <span class="stat-value">${Utils.formatCurrency(stats.totalCharges)}</span></div>`;
                }
                
                if (stats.totalBrokerageFees > 0) {
                    statsHtml += `<div class="stat">Total brokerage fees: <span class="stat-value">${Utils.formatCurrency(stats.totalBrokerageFees)}</span></div>`;
                }
            } else {
                // Show ready for review message when companies exist but no data yet
                statsHtml += '<div class="stat">Ready for review</div>';
            }
        }
        
        return statsHtml;
    }
    
    update(pipeline) {
        this.pipeline = pipeline;
        if (this.isRendered && this.element) {
            const stats = this.calculatePipelineStats(pipeline);
            this.element.innerHTML = this.renderStats(stats);
        }
    }
}

// Make PipelineStats available globally
window.PipelineStats = PipelineStats;