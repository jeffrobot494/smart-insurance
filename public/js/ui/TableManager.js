class TableManager {
    constructor(tableBodyElement, tableSectionElement) {
        this.tableBody = tableBodyElement;
        this.tableSection = tableSectionElement;
        this.firms = [];
    }

    createTable(firmNames) {
        this.clearTable();
        
        this.firms = firmNames.map((name, index) => ({
            id: index,
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
            <td class="progress-text" id="progress-${firmData.id}">${firmData.progress}</td>
            <td>
                <span class="status-waiting" id="status-${firmData.id}">${firmData.status}</span>
                <div id="download-${firmData.id}" style="display: none;">
                    <button class="download-pdf-btn" data-firm-id="${firmData.id}" data-firm-name="${firmData.name}">Download PDF</button>
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
        const firmId = event.target.getAttribute('data-firm-id');
        const firmName = event.target.getAttribute('data-firm-name');
        
        console.log(`TableManager: ${format.toUpperCase()} download clicked for firm ${firmName} (ID: ${firmId})`);
        
        // Fire download event with format
        document.dispatchEvent(new CustomEvent('downloadRequested', {
            detail: { 
                firmId: parseInt(firmId), 
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

    showDownloadButton(firmId) {
        const downloadDiv = document.getElementById(`download-${firmId}`);
        if (downloadDiv) {
            downloadDiv.style.display = 'block';
        }
    }

    updateProgress(firmId, progressText) {
        const progressElement = document.getElementById(`progress-${firmId}`);
        if (progressElement) {
            progressElement.textContent = progressText;
        }
    }

    updateStatus(firmId, statusText, statusClass) {
        const statusElement = document.getElementById(`status-${firmId}`);
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