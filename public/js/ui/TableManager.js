class TableManager {
    constructor(tableBodyElement, tableSectionElement) {
        this.tableBody = tableBodyElement;
        this.tableSection = tableSectionElement;
        this.firms = [];
    }

    createTable(firmNames, workflowExecutionIds = []) {
        this.clearTable();
        
        this.firms = firmNames.map((name, index) => ({
            id: workflowExecutionIds[index] || index, // Use workflowExecutionId if available, fallback to index
            workflowExecutionId: workflowExecutionIds[index] || index,
            name: name,
            progress: '',
            status: 'Waiting'
        }));
        
        this.firms.forEach(firm => {
            this.addRow(firm);
        });
        
        this.showTable();
    }

    addRow(firmData) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${firmData.name}</td>
            <td class="progress-text" id="progress-${firmData.workflowExecutionId}">${firmData.progress}</td>
            <td>
                <span class="status-waiting" id="status-${firmData.workflowExecutionId}">${firmData.status}</span>
                <div id="download-${firmData.workflowExecutionId}" style="display: none;">
                    <button class="download-pdf-btn" data-workflow-execution-id="${firmData.workflowExecutionId}" data-firm-name="${firmData.name}">Download PDF</button>
                </div>
            </td>
        `;
        
        const downloadPdfButton = row.querySelector('.download-pdf-btn');
        if (downloadPdfButton) {
            downloadPdfButton.addEventListener('click', (event) => {
                this.handleDownloadClick(event, 'pdf');
            });
        }
        
        this.tableBody.appendChild(row);
    }

    handleDownloadClick(event, format = 'json') {
        const workflowExecutionId = event.target.getAttribute('data-workflow-execution-id');
        const firmName = event.target.getAttribute('data-firm-name');
        
        console.log(`TableManager: ${format.toUpperCase()} download clicked for firm ${firmName} (Workflow ID: ${workflowExecutionId})`);
        
        // Fire download event with format
        document.dispatchEvent(new CustomEvent('downloadRequested', {
            detail: { 
                workflowExecutionId: parseInt(workflowExecutionId), 
                firmName,
                format
            }
        }));
    }

    updateRow(firmId, progressText, statusText, statusClass) {
        // Update a specific row's progress and status columns
    }

    clearTable() {
        if (this.tableBody) {
            this.tableBody.innerHTML = '';
        }
        this.firms = [];
    }

    showTable() {
        if (this.tableSection) {
            this.tableSection.style.display = 'block';
        }
    }

    hideTable() {
        // Hide the table section
    }

    getRowCount() {
        // Return the number of rows currently in the table
    }

    displayProgressTable(firms) {
        // Parse firm names array and create table structure with Name, Progress, Status columns
    }

    displaySavedResults(results) {
        // Implement saved results table display
    }

    showDownloadButton(workflowExecutionId) {
        const downloadDiv = document.getElementById(`download-${workflowExecutionId}`);
        if (downloadDiv) {
            downloadDiv.style.display = 'block';
        }
    }

    updateProgress(workflowExecutionId, progressText) {
        const progressElement = document.getElementById(`progress-${workflowExecutionId}`);
        if (progressElement) {
            progressElement.textContent = progressText;
        }
    }

    updateStatus(workflowExecutionId, statusText, statusClass) {
        const statusElement = document.getElementById(`status-${workflowExecutionId}`);
        if (statusElement) {
            statusElement.textContent = statusText;
            statusElement.className = statusClass;
        }
    }

    getStatusClass(status) {
        const statusClasses = {
            'Waiting': 'status-waiting',
            'Processing': 'status-processing',
            'Completed': 'status-completed',
            'Failed': 'status-failed'
        };
        return statusClasses[status] || 'status-waiting';
    }

    getFirmNames() {
        return this.firms.map(firm => firm.name);
    }
}