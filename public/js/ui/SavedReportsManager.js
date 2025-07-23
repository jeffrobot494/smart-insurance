class SavedReportsManager {
    constructor(savedTableBodyElement) {
        this.savedTableBody = savedTableBodyElement;
        this.savedReports = [];
        this.setupEventListeners();
        this.loadSavedReports();
    }

    setupEventListeners() {
        document.addEventListener('savedReportsLoaded', (event) => {
            this.handleSavedReportsLoaded(event);
        });
        
        document.addEventListener('reportDeleted', (event) => {
            this.handleReportDeleted(event);
        });
    }

    handleSavedReportsLoaded(reports) {
        console.log('SavedReportsManager.handleSavedReportsLoaded() - Received saved reports data');
        this.populateTable(reports);
    }

    handleReportDeleted(event) {
        console.log('SavedReportsManager.handleReportDeleted() - Report deleted, removing from table');
        const { reportId } = event.detail;
        this.removeReportRow(reportId);
    }

    async loadSavedReports() {
        console.log('SavedReportsManager.loadSavedReports() - TODO: Load saved reports from API');
        // Fire event to request saved reports from WorkflowManager
        document.dispatchEvent(new CustomEvent('savedReportsRequested'));
    }

    populateTable(reports) {
        console.log('SavedReportsManager.populateTable() - TODO: Clear existing rows and populate with saved reports');
        this.clearTable();
        this.savedReports = reports || [];
        
        this.savedReports.forEach(report => {
            this.addReportRow(report);
        });
    }

    addReportRow(report) {
        console.log('SavedReportsManager.addReportRow() - TODO: Add individual report row with download and delete buttons');
        const row = document.createElement('tr');
        row.setAttribute('data-report-id', report.id);
        row.innerHTML = `
            <td>${report.firmName}</td>
            <td>
                <button class="download-btn" data-report-id="${report.id}" data-firm-name="${report.firmName}">Download</button>
                <button class="delete-btn" data-report-id="${report.id}" data-firm-name="${report.firmName}">Delete</button>
            </td>
        `;
        
        // Add event listeners for download and delete buttons
        const downloadBtn = row.querySelector('.download-btn');
        const deleteBtn = row.querySelector('.delete-btn');
        
        if (downloadBtn) {
            downloadBtn.addEventListener('click', (event) => {
                this.handleDownloadClick(event);
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (event) => {
                this.handleDeleteClick(event);
            });
        }
        
        this.savedTableBody.appendChild(row);
    }

    handleDownloadClick(event) {
        console.log('SavedReportsManager.handleDownloadClick() - TODO: Fire downloadRequested event to UIManager -> WorkflowManager');
        const reportId = event.target.getAttribute('data-report-id');
        const firmName = event.target.getAttribute('data-firm-name');
        
        console.log(`SavedReportsManager: Download clicked for saved report ${firmName} (ID: ${reportId})`);
        
        // Fire download event - reuse existing downloadRequested event
        document.dispatchEvent(new CustomEvent('downloadRequested', {
            detail: { 
                firmId: parseInt(reportId), 
                firmName,
                format: 'pdf',
                isFromSaved: true
            }
        }));
    }

    handleDeleteClick(event) {
        console.log('SavedReportsManager.handleDeleteClick() - TODO: Fire deleteRequested event and remove from UI after confirmation');
        const reportId = event.target.getAttribute('data-report-id');
        const firmName = event.target.getAttribute('data-firm-name');
        
        console.log(`SavedReportsManager: Delete clicked for saved report ${firmName} (ID: ${reportId})`);
        
        // Show confirmation dialog
        if (confirm(`Are you sure you want to delete the report for ${firmName}?`)) {
            // Fire delete event
            document.dispatchEvent(new CustomEvent('deleteRequested', {
                detail: { 
                    reportId: parseInt(reportId), 
                    firmName
                }
            }));
        }
    }

    clearTable() {
        console.log('SavedReportsManager.clearTable() - TODO: Clear all rows from saved reports table');
        if (this.savedTableBody) {
            this.savedTableBody.innerHTML = '';
        }
        this.savedReports = [];
    }

    removeReportRow(reportId) {
        console.log('SavedReportsManager.removeReportRow() - TODO: Remove specific report row from table');
        const row = this.savedTableBody.querySelector(`tr[data-report-id="${reportId}"]`);
        if (row) {
            row.remove();
        }
        
        // Remove from local array
        this.savedReports = this.savedReports.filter(report => report.id !== reportId);
    }

    refreshTable() {
        console.log('SavedReportsManager.refreshTable() - Reloading saved reports');
        this.loadSavedReports();
    }
}