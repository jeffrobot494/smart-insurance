// Smart Insurance - Form 5500 Card Component

class Form5500Card extends BaseComponent {
    constructor(form5500Data, callbacks = {}) {
        super(form5500Data, callbacks);
        this.form5500Data = form5500Data;
    }
    
    render() {
        if (!this.form5500Data) {
            this.element = this.createElement('div');
            this.element.style.display = 'none';
            this.isRendered = true;
            return this.element;
        }
        
        this.element = this.createElement('div');
        this.element.innerHTML = this.renderForm5500Data();
        
        this.isRendered = true;
        return this.element;
    }
    
    renderForm5500Data() {
        const data = this.form5500Data;
        let html = '';
        
        if (data.ein) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">EIN:</div>
                    <div class="detail-value">${data.ein}</div>
                </div>
            `;
        }
        
        if (data.plan_year) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">Plan Year:</div>
                    <div class="detail-value">${data.plan_year}</div>
                </div>
            `;
        }
        
        if (data.active_participants) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">Active Participants:</div>
                    <div class="detail-value">${Utils.formatNumber(data.active_participants)}</div>
                </div>
            `;
        }
        
        if (data.insurance_carriers && data.insurance_carriers.length > 0) {
            const carriersHtml = data.insurance_carriers.map(carrier => 
                `<div>• ${carrier.name} (${carrier.type})</div>`
            ).join('');
            
            html += `
                <div class="detail-row">
                    <div class="detail-label">Insurance Carriers:</div>
                    <div class="detail-value">${carriersHtml}</div>
                </div>
            `;
        }
        
        if (data.total_charges) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">Total Charges Paid:</div>
                    <div class="detail-value">${Utils.formatCurrency(data.total_charges)}</div>
                </div>
            `;
        }
        
        if (data.broker_commission) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">Broker Commission:</div>
                    <div class="detail-value">${Utils.formatCurrency(data.broker_commission)}</div>
                </div>
            `;
        }
        
        return html;
    }
    
    update(form5500Data) {
        this.form5500Data = form5500Data;
        if (this.isRendered && this.element) {
            if (form5500Data) {
                this.element.innerHTML = this.renderForm5500Data();
                this.element.style.display = 'block';
            } else {
                this.element.style.display = 'none';
            }
        }
    }
}

// Make Form5500Card available globally
window.Form5500Card = Form5500Card;