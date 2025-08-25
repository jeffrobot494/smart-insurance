// Smart Insurance - Pipeline Card Manager (Refactored)

class PipelineCardManager {
    constructor(api) {
        this.api = api;
        this.pipelineCards = new Map(); // pipelineId -> PipelineCard
        // Remove: this.statusPolling (skipped for initial refactor)
        // Remove: this.expandedCards (moved to individual PipelineCard components)
    }
    
    // Create a pipeline card using component system
    createPipelineCard(pipeline, targetContainer = null) {
        console.log('PipelineCardManager: Creating card for pipeline:', pipeline.pipeline_id);
        
        // Create PipelineCard component (starts collapsed)
        const pipelineCard = new PipelineCard(pipeline, {
            onSave: (pipeline) => this.handlePipelineDataSave(pipeline)
        });
        
        // Render and add to DOM
        const cardElement = pipelineCard.render();
        const container = targetContainer || this.getPipelineContainer();
        if (container) {
            container.appendChild(cardElement);
        }
        
        // Store component reference
        this.pipelineCards.set(pipeline.pipeline_id, pipelineCard);
        
        return cardElement;
    }
    
    // Update existing pipeline card
    updatePipelineCard(pipelineId, pipeline) {
        console.log('PipelineCardManager: Updating card for pipeline:', pipelineId);
        
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard) {
            pipelineCard.update(pipeline);
        } else {
            console.warn('PipelineCardManager: Card component not found for pipeline:', pipelineId);
        }
    }
    
    // Remove pipeline card
    removePipelineCard(pipelineId) {
        console.log('PipelineCardManager: Removing card for pipeline:', pipelineId);
        
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard) {
            pipelineCard.destroy();
            this.pipelineCards.delete(pipelineId);
        }
    }
    
    // Render saved pipelines (for saved tab)
    renderSavedPipelines(pipelines, container) {
        console.log('PipelineCardManager: Rendering saved pipelines:', pipelines.length);
        
        container.innerHTML = '';
        
        pipelines.forEach(pipeline => {
            this.createPipelineCard(pipeline, container);
        });
    }
    
    // Get pipeline container element
    getPipelineContainer() {
        return Utils.findElement('#pipeline-results');
    }
    
    // API Integration - callback from PipelineCard when save is triggered
    async handlePipelineDataSave(pipeline) {
        console.log('PipelineCardManager: Saving pipeline data:', pipeline.pipeline_id);
        try {
            const response = await this.api.updatePipeline(pipeline.pipeline_id, pipeline);
            if (response.success) {
                // Update UI with saved data
                this.updatePipelineCard(pipeline.pipeline_id, response.pipeline);
                console.log('PipelineCardManager: Pipeline saved successfully');
            } else {
                console.error('PipelineCardManager: Save failed:', response.error);
            }
        } catch (error) {
            console.error('PipelineCardManager: Save error:', error);
        }
    }
    
    // Handle pipeline actions - route to existing app methods
    handlePipelineAction(pipelineId, action, step = null) {
        console.log('PipelineCardManager: Pipeline action:', { pipelineId, action, step });
        
        switch (action) {
            case 'start-research':
                // Route to existing app method
                window.app?.handleStartResearch?.(pipelineId);
                break;
            case 'delete':
                // Route to existing app method
                window.app?.handleDeletePipeline?.(pipelineId);
                break;
            case 'proceed':
                // Route to existing app method
                window.app?.handleProceedToStep?.(pipelineId, step);
                break;
            case 'report':
                window.app?.handleGenerateReport?.(pipelineId);
                break;
            case 'edit':
                window.app?.handleEditPipeline?.(pipelineId);
                break;
            case 'retry':
                window.app?.handleRetryPipeline?.(pipelineId);
                break;
            default:
                console.warn('PipelineCardManager: Unknown action:', action);
        }
    }
    
    // Backward compatibility methods (simplified)
    togglePipelineCard(pipelineId) {
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard) {
            pipelineCard.toggle();
        }
    }
    
    toggleCompanyDetails(pipelineId, companyIndex) {
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard && pipelineCard.companyList) {
            const companyCard = pipelineCard.companyList.companyCards[companyIndex];
            if (companyCard) {
                companyCard.toggleDetails();
            }
        }
    }
    
    showAddCompanyForm(pipelineId) {
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard) {
            pipelineCard.showAddCompanyForm();
        }
    }
    
    hideAddCompanyForm(pipelineId) {
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard && pipelineCard.addCompanyForm) {
            pipelineCard.addCompanyForm.hide();
        }
    }
    
    // Placeholder methods for Phase 3 implementation
    updateCompanyField(pipelineId, companyIndex, fieldName, value) {
        console.log('PipelineCardManager: Update company field:', { pipelineId, companyIndex, fieldName, value });
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard) {
            pipelineCard.handleCompanyFieldChange(companyIndex, fieldName, value);
        }
    }
    
    toggleCompanyExited(pipelineId, companyIndex) {
        console.log('PipelineCardManager: Toggle company exited:', { pipelineId, companyIndex });
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard) {
            pipelineCard.handleCompanyToggleExited(companyIndex);
        }
    }
    
    removeCompany(pipelineId, companyIndex, event) {
        if (event) event.stopPropagation();
        if (confirm('Remove this company from the list?')) {
            console.log('PipelineCardManager: Remove company:', { pipelineId, companyIndex });
            const pipelineCard = this.pipelineCards.get(pipelineId);
            if (pipelineCard) {
                pipelineCard.handleCompanyRemove(companyIndex);
            }
        }
    }
    
    addCompany(pipelineId) {
        const pipelineCard = this.pipelineCards.get(pipelineId);
        if (pipelineCard && pipelineCard.addCompanyForm) {
            const companyData = pipelineCard.addCompanyForm.getFormData();
            if (companyData) {
                pipelineCard.handleAddCompany(companyData);
            }
        }
    }
    
    // Pipeline action handlers - route to app methods
    proceedToLegalResolution(pipelineId) {
        this.handlePipelineAction(pipelineId, 'proceed', 'legal-resolution');
    }
    
    proceedToDataExtraction(pipelineId) {
        this.handlePipelineAction(pipelineId, 'proceed', 'data-extraction');
    }
    
    generateReport(pipelineId) {
        this.handlePipelineAction(pipelineId, 'report');
    }
    
    editPipeline(pipelineId) {
        this.handlePipelineAction(pipelineId, 'edit');
    }
    
    retryPipeline(pipelineId) {
        this.handlePipelineAction(pipelineId, 'retry');
    }
    
    deletePipeline(pipelineId) {
        this.handlePipelineAction(pipelineId, 'delete');
    }
    
    // Backward compatibility for status polling (skipped in refactor)
    stopStatusPolling(pipelineId) {
        console.log('PipelineCardManager: stopStatusPolling() - Polling was skipped in refactor');
        // No-op since we skipped status polling in the refactor
    }
    
    startStatusPolling(pipelineId) {
        console.log('PipelineCardManager: startStatusPolling() - Polling was skipped in refactor');
        // No-op since we skipped status polling in the refactor
    }
    
    // Check if pipeline is running (used by app.js for polling logic)
    isPipelineRunning(status) {
        return status && (status.endsWith('_running') || status.includes('running'));
    }
    
    // Cleanup method
    cleanup() {
        console.log('PipelineCardManager: Cleaning up components');
        this.pipelineCards.forEach(pipelineCard => pipelineCard.destroy());
        this.pipelineCards.clear();
    }
}

// Make PipelineCardManager available globally
window.PipelineCardManager = PipelineCardManager;