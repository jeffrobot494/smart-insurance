// Smart Insurance - Pipeline Card Manager

class PipelineCardManager {
    constructor(api) {
        this.api = api;
        this.expandedCards = new Set();
        this.statusPollers = new Map(); // Track polling intervals
    }

    // Create a pipeline card element
    createPipelineCard(pipeline, targetContainer = null) {
        console.log('PipelineCardManager: Creating card for pipeline:', pipeline.pipeline_id);
        
        const card = Utils.createElement('div', 'pipeline-card', {
            'data-pipeline-id': pipeline.pipeline_id
        });
        
        // Render card content
        this.renderPipelineCard(card, pipeline);
        
        // Add to specified container or default work tab container
        const container = targetContainer || this.getPipelineContainer();
        if (container) {
            container.appendChild(card);
        }
        
        // Start status polling if pipeline is running
        if (this.isPipelineRunning(pipeline.status)) {
            this.startStatusPolling(pipeline.pipeline_id);
        }
        
        // Set initial collapsed state (cards start collapsed)
        const pipelineContent = card.querySelector('.pipeline-content');
        if (pipelineContent) {
            pipelineContent.style.display = 'none';
        }
        
        return card;
    }

    // Render pipeline card content
    renderPipelineCard(cardElement, pipeline) {
        const statusDisplay = Utils.getStatusDisplay(pipeline.status);
        const formattedDate = Utils.formatDate(pipeline.created_at);
        
        cardElement.innerHTML = `
            <div class="pipeline-header" onclick="window.app.cards.togglePipelineCard(${pipeline.pipeline_id})">
                <div>
                    <div class="pipeline-title">${pipeline.firm_name}</div>
                    ${pipeline.status === 'data_extraction_complete' ? 
                        `<div class="pipeline-date">Completed: ${formattedDate}</div>` : 
                        `<div class="pipeline-date">Started: ${formattedDate}</div>`
                    }
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="status-badge ${statusDisplay.class}">${statusDisplay.text}</div>
                    <span class="expand-icon">▼</span>
                </div>
            </div>
            <div class="pipeline-content">
                ${this.renderPipelineContent(pipeline)}
            </div>
        `;
    }

    // Render pipeline content section
    renderPipelineContent(pipeline) {
        const companies = pipeline.companies || [];
        const stats = this.calculatePipelineStats(pipeline);
        
        let content = `<div class="stats-row">${this.renderStats(stats)}</div>`;
        
        // Add company list if pipeline has progressed beyond pending
        if (pipeline.status !== 'pending' && companies.length > 0) {
            content += this.renderCompanyList(pipeline);
        }
        
        // Add progress information for running pipelines
        if (this.isPipelineRunning(pipeline.status)) {
            content += this.renderProgressInfo(pipeline);
        }
        
        // Add action buttons
        content += this.renderActionButtons(pipeline);
        
        return content;
    }

    // Calculate pipeline statistics
    calculatePipelineStats(pipeline) {
        const companies = pipeline.companies || [];
        let companiesWithData = 0;
        let totalParticipants = 0;
        let totalCharges = 0;
        
        companies.forEach(company => {
            if (company.form5500_data) {
                companiesWithData++;
                totalParticipants += company.form5500_data.active_participants || 0;
                totalCharges += company.form5500_data.total_charges || 0;
            }
        });
        
        return {
            totalCompanies: companies.length,
            companiesWithData,
            totalParticipants,
            totalCharges
        };
    }

    // Render statistics row
    renderStats(stats) {
        if (stats.totalCompanies === 0) {
            return '<div class="stat">Status: <span class="stat-value">Queued</span></div>';
        }
        
        let statsHtml = `<div class="stat">Portfolio companies: <span class="stat-value">${stats.totalCompanies}</span></div>`;
        
        if (stats.companiesWithData > 0) {
            statsHtml += `<div class="stat">With 5500 data: <span class="stat-value">${stats.companiesWithData}</span></div>`;
            
            if (stats.totalParticipants > 0) {
                statsHtml += `<div class="stat">Active participants: <span class="stat-value">${Utils.formatNumber(stats.totalParticipants)}</span></div>`;
            }
            
            if (stats.totalCharges > 0) {
                statsHtml += `<div class="stat">Total charges: <span class="stat-value">${Utils.formatCurrency(stats.totalCharges)}</span></div>`;
            }
        } else if (stats.totalCompanies > 0) {
            // Show different message based on pipeline status
            if (stats.totalCompanies > 0) {
                statsHtml += '<div class="stat">Ready for review</div>';
            }
        }
        
        return statsHtml;
    }

    // Render company list section
    renderCompanyList(pipeline) {
        const companies = pipeline.companies || [];
        if (companies.length === 0) return '';
        
        const headerText = this.getCompanyListHeader(pipeline.status);
        
        let html = `
            <div class="company-list">
                <div class="company-section-header">
                    <h4>${headerText}</h4>
                    ${pipeline.status === 'research_complete' ? 
                        `<button class="btn btn-success" onclick="window.app.cards.showAddCompanyForm(${pipeline.pipeline_id})">+ Add Company</button>` : ''
                    }
                </div>
        `;
        
        // Render each company
        companies.forEach((company, index) => {
            html += this.renderCompanyItem(company, index, pipeline.pipeline_id, pipeline.status);
        });
        
        // Add company form (hidden by default)
        if (pipeline.status === 'research_complete') {
            html += this.renderAddCompanyForm(pipeline.pipeline_id);
        }
        
        html += '</div>';
        return html;
    }

    // Get appropriate header text for company list
    getCompanyListHeader(status) {
        switch (status) {
            case 'research_complete':
                return 'Portfolio Companies (Click to edit)';
            case 'legal_resolution_complete':
                return 'Portfolio Companies (Legal Entities Resolved - Click to edit)';
            case 'data_extraction_complete':
                return 'Portfolio Companies (Final Results)';
            default:
                return 'Portfolio Companies';
        }
    }

    // Render individual company item
    renderCompanyItem(company, index, pipelineId, pipelineStatus) {
        const confidenceClass = `confidence-${(company.confidence_level || 'low')}`;
        const confidenceText = (company.confidence_level || 'low').toUpperCase();
        
        // Determine status indicator
        let statusIndicator = '';
        if (company.form5500_data) {
            statusIndicator = '<span style="color: #28a745; font-weight: 600; margin-left: 10px;">✓ Form 5500 Data Found</span>';
        } else if (company.legal_entity_name && pipelineStatus === 'legal_resolution_complete') {
            statusIndicator = '<span style="color: #28a745; font-weight: 600; margin-left: 10px;">✓ Legal Entity Found</span>';
        } else if (pipelineStatus === 'legal_resolution_complete') {
            statusIndicator = '<span style="color: #856404; font-weight: 600; margin-left: 10px;">⚠ Review Needed</span>';
        }
        
        const isEditable = pipelineStatus === 'research_complete' || pipelineStatus === 'legal_resolution_complete';
        
        return `
            <div class="company-item">
                <div class="company-header" onclick="window.app.cards.toggleCompanyDetails(${pipelineId}, ${index})">
                    <div class="company-info">
                        <span class="confidence-badge ${confidenceClass}">${confidenceText}</span>
                        <span>${company.name}</span>
                        ${statusIndicator}
                    </div>
                    <div class="company-actions">
                        ${isEditable ? `
                            <input type="checkbox" class="checkbox" ${company.exited ? 'checked' : ''} 
                                   onchange="window.app.cards.toggleCompanyExited(${pipelineId}, ${index})"> Exited
                            <button class="btn btn-danger" onclick="window.app.cards.removeCompany(${pipelineId}, ${index}, event)">Remove</button>
                        ` : `
                            <span style="color: ${company.exited ? '#dc3545' : '#666'}; font-size: 12px;">
                                ${company.exited ? 'Exited' : 'Active'}
                            </span>
                        `}
                        <span class="expand-icon">▼</span>
                    </div>
                </div>
                <div class="company-details" id="company-details-${pipelineId}-${index}">
                    ${this.renderCompanyDetails(company, index, pipelineId, pipelineStatus)}
                </div>
            </div>
        `;
    }

    // Render company details section
    renderCompanyDetails(company, index, pipelineId, pipelineStatus) {
        const isEditable = pipelineStatus === 'research_complete' || pipelineStatus === 'legal_resolution_complete';
        
        let html = `
            <div class="detail-row">
                <div class="detail-label">Company Name:</div>
                <div class="detail-value">
                    ${isEditable ? 
                        `<input type="text" class="editable-input" value="${company.name}" 
                                onchange="window.app.cards.updateCompanyField(${pipelineId}, ${index}, 'name', this.value)">` :
                        company.name
                    }
                </div>
            </div>
        `;
        
        if (company.legal_entity_name || pipelineStatus === 'legal_resolution_complete') {
            const bgColor = isEditable && pipelineStatus === 'legal_resolution_complete' ? 
                (company.confidence_level === 'high' ? '#d4edda' : '#fff3cd') : '';
            
            html += `
                <div class="detail-row">
                    <div class="detail-label">Legal Entity Name:</div>
                    <div class="detail-value">
                        ${isEditable && pipelineStatus === 'legal_resolution_complete' ? 
                            `<input type="text" class="editable-input" value="${company.legal_entity_name || ''}" 
                                    style="background: ${bgColor}" 
                                    onchange="window.app.cards.updateCompanyField(${pipelineId}, ${index}, 'legal_entity_name', this.value)">` :
                            (company.legal_entity_name || 'Pending legal resolution...')
                        }
                    </div>
                </div>
            `;
        }
        
        if (company.city || company.state) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">Location:</div>
                    <div class="detail-value">${company.city || ''}, ${company.state || ''}</div>
                </div>
            `;
        }
        
        // Add confidence/match information
        if (company.confidence_level || pipelineStatus === 'legal_resolution_complete') {
            let confidenceText = '';
            if (company.confidence_level === 'high') {
                confidenceText = 'High - Exact match found';
            } else if (company.confidence_level === 'medium') {
                confidenceText = 'Medium - Partial match, manual review recommended';
            } else {
                confidenceText = 'High - Found on portfolio page';
            }
            
            html += `
                <div class="detail-row">
                    <div class="detail-label">Match Confidence:</div>
                    <div class="detail-value">${confidenceText}</div>
                </div>
            `;
        }
        
        // Add Form 5500 data if available
        if (company.form5500_data) {
            html += this.renderForm5500Data(company.form5500_data);
        }
        
        return html;
    }

    // Render Form 5500 data section
    renderForm5500Data(data) {
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

    // Render add company form
    renderAddCompanyForm(pipelineId) {
        return `
            <div id="add-form-${pipelineId}" class="add-company-form">
                <h5 style="margin-bottom: 15px;">Add New Company</h5>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Company Name *</label>
                        <input type="text" class="editable-input" id="new-company-name-${pipelineId}" placeholder="Enter company name">
                    </div>
                    <div class="form-group" style="flex: 0 0 120px;">
                        <label class="form-label">Status</label>
                        <label style="display: flex; align-items: center; margin-top: 8px;">
                            <input type="checkbox" class="checkbox" id="new-company-exited-${pipelineId}"> Exited
                        </label>
                    </div>
                </div>
                <div class="button-row">
                    <button class="btn btn-success" onclick="window.app.cards.addCompany(${pipelineId})">Add Company</button>
                    <button class="btn btn-secondary" onclick="window.app.cards.hideAddCompanyForm(${pipelineId})">Cancel</button>
                </div>
            </div>
        `;
    }

    // Render progress information for running pipelines
    renderProgressInfo(pipeline) {
        // This would show progress bars, estimated time, etc.
        // For now, just show basic progress info
        return `
            <div class="progress-section" style="margin: 15px 0;">
                <div class="stat">Progress: <span class="stat-value">Processing...</span></div>
                <div class="stat">Estimated time: <span class="stat-value">2-5 minutes</span></div>
            </div>
        `;
    }

    // Render action buttons
    renderActionButtons(pipeline) {
        const buttons = [];
        
        switch (pipeline.status) {
            case 'research_complete':
                buttons.push(`<button class="btn btn-primary" onclick="window.app.cards.proceedToLegalResolution(${pipeline.pipeline_id})">Proceed to Legal Resolution</button>`);
                buttons.push(`<button class="btn btn-secondary" onclick="window.app.cards.editPipeline(${pipeline.pipeline_id})">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" onclick="window.app.cards.deletePipeline(${pipeline.pipeline_id})">Delete</button>`);
                break;
                
            case 'legal_resolution_complete':
                buttons.push(`<button class="btn btn-primary" onclick="window.app.cards.proceedToDataExtraction(${pipeline.pipeline_id})">Proceed to Data Extraction</button>`);
                buttons.push(`<button class="btn btn-secondary" onclick="window.app.cards.editPipeline(${pipeline.pipeline_id})">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" onclick="window.app.cards.deletePipeline(${pipeline.pipeline_id})">Delete</button>`);
                break;
                
            case 'data_extraction_complete':
                buttons.push(`<button class="btn btn-success" onclick="window.app.cards.generateReport(${pipeline.pipeline_id})">Generate Report</button>`);
                buttons.push(`<button class="btn btn-secondary" onclick="window.app.cards.editPipeline(${pipeline.pipeline_id})">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" onclick="window.app.cards.deletePipeline(${pipeline.pipeline_id})">Delete</button>`);
                break;
                
            case 'failed':
                buttons.push(`<button class="btn btn-primary" onclick="window.app.cards.retryPipeline(${pipeline.pipeline_id})">Retry</button>`);
                buttons.push(`<button class="btn btn-danger" onclick="window.app.cards.deletePipeline(${pipeline.pipeline_id})">Delete</button>`);
                break;
                
            case 'pending':
            case 'research_running':
            case 'legal_resolution_running':
            case 'data_extraction_running':
                // For running/pending pipelines, only show delete option
                buttons.push(`<button class="btn btn-danger" onclick="window.app.cards.deletePipeline(${pipeline.pipeline_id})">Delete</button>`);
                break;
        }
        
        if (buttons.length === 0) {
            return '';
        }
        
        return `<div class="button-row">${buttons.join('')}</div>`;
    }

    // Update existing pipeline card
    updatePipelineCard(pipelineId, pipeline) {
        console.log('PipelineCardManager: Updating card for pipeline:', pipelineId);
        
        const cardElement = Utils.findElement(`[data-pipeline-id="${pipelineId}"]`);
        if (cardElement) {
            this.renderPipelineCard(cardElement, pipeline);
            
            // Handle status changes
            if (this.isPipelineRunning(pipeline.status)) {
                this.startStatusPolling(pipelineId);
            } else {
                this.stopStatusPolling(pipelineId);
            }
        } else {
            console.warn('PipelineCardManager: Card element not found for pipeline:', pipelineId);
        }
    }

    // Get pipeline container element
    getPipelineContainer() {
        return Utils.findElement('#pipeline-results');
    }

    // Check if pipeline is in running state
    isPipelineRunning(status) {
        return status && status.includes('running');
    }

    // Start status polling for a pipeline
    startStatusPolling(pipelineId) {
        if (this.statusPollers.has(pipelineId)) {
            return; // Already polling
        }
        
        console.log('PipelineCardManager: Starting status polling for pipeline:', pipelineId);
        
        const stopPolling = this.api.startStatusPolling(pipelineId, (pipeline, error) => {
            if (error) {
                console.error('Status polling error for pipeline', pipelineId, error);
                this.stopStatusPolling(pipelineId);
                return;
            }
            
            if (pipeline) {
                this.updatePipelineCard(pipelineId, pipeline);
                
                // Stop polling if pipeline is no longer running
                if (!this.isPipelineRunning(pipeline.status)) {
                    this.stopStatusPolling(pipelineId);
                }
            }
        });
        
        this.statusPollers.set(pipelineId, stopPolling);
    }

    // Stop status polling for a pipeline
    stopStatusPolling(pipelineId) {
        const stopPolling = this.statusPollers.get(pipelineId);
        if (stopPolling) {
            console.log('PipelineCardManager: Stopping status polling for pipeline:', pipelineId);
            stopPolling();
            this.statusPollers.delete(pipelineId);
        }
    }

    // Event Handlers
    togglePipelineCard(pipelineId) {
        console.log('PipelineCardManager: Toggle pipeline card:', pipelineId);
        
        const cardElement = Utils.findElement(`[data-pipeline-id="${pipelineId}"]`);
        if (!cardElement) {
            console.warn('PipelineCardManager: Card element not found for pipeline:', pipelineId);
            return;
        }
        
        const pipelineContent = cardElement.querySelector('.pipeline-content');
        const expandIcon = cardElement.querySelector('.expand-icon');
        
        if (pipelineContent && expandIcon) {
            // Toggle expanded state
            if (this.expandedCards.has(pipelineId)) {
                // Collapse the card
                pipelineContent.style.display = 'none';
                expandIcon.classList.remove('rotated');
                this.expandedCards.delete(pipelineId);
            } else {
                // Expand the card
                pipelineContent.style.display = 'block';
                expandIcon.classList.add('rotated');
                this.expandedCards.add(pipelineId);
            }
        }
    }

    toggleCompanyDetails(pipelineId, companyIndex) {
        const detailsElement = Utils.findElement(`#company-details-${pipelineId}-${companyIndex}`);
        const headerElement = detailsElement?.previousElementSibling;
        const iconElement = headerElement?.querySelector('.expand-icon');
        
        if (detailsElement && iconElement) {
            detailsElement.classList.toggle('expanded');
            iconElement.classList.toggle('rotated');
        }
    }

    // Company management methods
    updateCompanyField(pipelineId, companyIndex, fieldName, value) {
        console.log('PipelineCardManager: Update company field:', { pipelineId, companyIndex, fieldName, value });
        // This will be fully implemented in Phase 3 with CompanyManager
    }

    toggleCompanyExited(pipelineId, companyIndex) {
        console.log('PipelineCardManager: Toggle company exited:', { pipelineId, companyIndex });
        // This will be fully implemented in Phase 3 with CompanyManager
    }

    removeCompany(pipelineId, companyIndex, event) {
        event.stopPropagation();
        if (confirm('Remove this company from the list?')) {
            console.log('PipelineCardManager: Remove company:', { pipelineId, companyIndex });
            // This will be fully implemented in Phase 3 with CompanyManager
        }
    }

    showAddCompanyForm(pipelineId) {
        const form = Utils.findElement(`#add-form-${pipelineId}`);
        if (form) {
            form.classList.add('show');
            const nameInput = Utils.findElement(`#new-company-name-${pipelineId}`);
            if (nameInput) nameInput.focus();
        }
    }

    hideAddCompanyForm(pipelineId) {
        const form = Utils.findElement(`#add-form-${pipelineId}`);
        if (form) {
            form.classList.remove('show');
            // Clear form
            const nameInput = Utils.findElement(`#new-company-name-${pipelineId}`);
            const exitedInput = Utils.findElement(`#new-company-exited-${pipelineId}`);
            if (nameInput) nameInput.value = '';
            if (exitedInput) exitedInput.checked = false;
        }
    }

    addCompany(pipelineId) {
        const nameInput = Utils.findElement(`#new-company-name-${pipelineId}`);
        const exitedInput = Utils.findElement(`#new-company-exited-${pipelineId}`);
        
        if (!nameInput || !nameInput.value.trim()) {
            alert('Please enter a company name');
            return;
        }
        
        const companyData = {
            name: nameInput.value.trim(),
            exited: exitedInput ? exitedInput.checked : false
        };
        
        console.log('PipelineCardManager: Add company:', { pipelineId, companyData });
        // This will be fully implemented in Phase 3 with CompanyManager
        this.hideAddCompanyForm(pipelineId);
    }

    // Pipeline action handlers
    proceedToLegalResolution(pipelineId) {
        console.log('PipelineCardManager: Proceed to legal resolution:', pipelineId);
        // This will trigger the next workflow step
        window.app?.handleProceedToStep?.(pipelineId, 'legal-resolution');
    }

    proceedToDataExtraction(pipelineId) {
        console.log('PipelineCardManager: Proceed to data extraction:', pipelineId);
        // This will trigger the next workflow step  
        window.app?.handleProceedToStep?.(pipelineId, 'data-extraction');
    }

    generateReport(pipelineId) {
        console.log('PipelineCardManager: Generate report:', pipelineId);
        window.app?.handleGenerateReport?.(pipelineId);
    }

    editPipeline(pipelineId) {
        console.log('PipelineCardManager: Edit pipeline:', pipelineId);
        window.app?.handleEditPipeline?.(pipelineId);
    }

    retryPipeline(pipelineId) {
        console.log('PipelineCardManager: Retry pipeline:', pipelineId);
        window.app?.handleRetryPipeline?.(pipelineId);
    }

    deletePipeline(pipelineId) {
        if (confirm('Delete this pipeline? This action cannot be undone.')) {
            console.log('PipelineCardManager: Delete pipeline:', pipelineId);
            window.app?.handleDeletePipeline?.(pipelineId);
        }
    }

    // Render saved pipelines (for saved tab)
    renderSavedPipelines(pipelines, container) {
        console.log('PipelineCardManager: Rendering saved pipelines:', pipelines.length);
        
        container.innerHTML = '';
        
        pipelines.forEach(pipeline => {
            // Use the existing method with target container
            this.createPipelineCard(pipeline, container);
        });
    }

    // Cleanup method
    cleanup() {
        console.log('PipelineCardManager: Cleaning up status pollers');
        this.statusPollers.forEach(stopPolling => stopPolling());
        this.statusPollers.clear();
    }
}

window.PipelineCardManager = PipelineCardManager;