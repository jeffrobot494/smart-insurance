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
                    <button class="download-btn" data-firm-id="${firmData.id}" data-firm-name="${firmData.name}">Download</button>
                </div>
            </td>
        `;
        
        // Add click event listener to download button
        const downloadButton = row.querySelector('.download-btn');
        if (downloadButton) {
            downloadButton.addEventListener('click', (event) => {
                this.handleDownloadClick(event);
            });
        }
        
        this.tableBody.appendChild(row);
    }

    handleDownloadClick(event) {
        const firmId = event.target.getAttribute('data-firm-id');
        const firmName = event.target.getAttribute('data-firm-name');
        
        console.log(`TableManager: Download clicked for firm ${firmName} (ID: ${firmId})`);
        
        // Fire download event
        document.dispatchEvent(new CustomEvent('downloadRequested', {
            detail: { firmId: parseInt(firmId), firmName }
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