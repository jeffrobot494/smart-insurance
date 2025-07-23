class UIManager {
    constructor() {
        this.elements = {
            tabButtons: null,
            tabContents: null,
            csvFile: null,
            uploadBtn: null,
            startBtn: null,
            tableSection: null,
            tableBody: null,
            savedTableBody: null
        };
        this.initializeElements();
        this.initializeManagers();
    }

    initializeManagers() {
        this.tabManager = new TabManager(this.elements.tabButtons, this.elements.tabContents);
        this.startButtonManager = new StartButtonManager(this.elements.startBtn);
        this.tableManager = new TableManager(this.elements.tableBody, this.elements.tableSection);
        this.fileUploadManager = new FileUploadManager(this.elements.csvFile, this.elements.uploadBtn);
        this.notificationManager = new NotificationManager();
        this.savedReportsManager = new SavedReportsManager(this.elements.savedTableBody);
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        document.addEventListener('csvUploaded', (event) => {
            this.handleCsvUploaded(event);
        });
        
        document.addEventListener('csvUploadError', (event) => {
            this.handleCsvUploadError(event);
        });
        
        document.addEventListener('startButtonClicked', (event) => {
            this.handleStartButtonClicked(event);
        });
        
        document.addEventListener('savedReportsRequested', (event) => {
            this.handleSavedReportsRequested(event);
        });
        
        document.addEventListener('deleteRequested', (event) => {
            this.handleDeleteRequested(event);
        });
    }

    handleCsvUploaded(event) {
        console.log('CSV uploaded with firm names:', event.detail.firmNames);
        this.notificationManager.showCsvUploadSuccess(event.detail.firmNames.length);
        this.tableManager.createTable(event.detail.firmNames);
        this.startButtonManager.enableStartButton();
    }

    handleCsvUploadError(event) {
        console.log('CSV upload error:', event.detail.error);
        this.notificationManager.showCsvUploadError(event.detail.error);
    }

    handleStartButtonClicked(event) {
        console.log('Start button clicked - preparing to start workflow');
        
        // Get the uploaded firms data from the table manager
        const firmNames = this.tableManager.getFirmNames();
        
        if (firmNames && firmNames.length > 0) {
            // Fire workflow start event with firm data
            document.dispatchEvent(new CustomEvent('workflowStartRequested', {
                detail: { firmNames }
            }));
        } else {
            this.notificationManager.showError('No firms uploaded. Please upload a CSV file first.');
        }
    }

    handleWorkflowProgress(eventDetail) {
        console.log('UIManager handling workflow progress:', eventDetail);
        const { workflowExecutionId, messages } = eventDetail;
        
        // Get the latest message to show as progress
        if (messages && messages.length > 0) {
            const latestMessage = messages[messages.length - 1];
            this.updateProgress(workflowExecutionId, latestMessage.message);
        }
    }

    handleWorkflowComplete(eventDetail) {
        console.log('UIManager handling workflow complete:', eventDetail);
        const { workflowExecutionId } = eventDetail;
        
        // Mark firm as completed in UI
        this.updateStatus(workflowExecutionId, 'Completed', 'status-complete');
        this.showDownloadButton(workflowExecutionId);
    }

    initializeElements() {
        this.elements = {
            tabButtons: document.querySelectorAll('.tab-button'),
            tabContents: document.querySelectorAll('.tab-content'),
            csvFile: document.getElementById('csvFile'),
            uploadBtn: document.querySelector('.upload-btn'),
            startBtn: document.getElementById('startBtn'),
            tableSection: document.getElementById('tableSection'),
            tableBody: document.getElementById('tableBody'),
            savedTableBody: document.getElementById('savedTableBody')
        };

        // Tab and start button management now handled by respective managers
    }

    showTab(tabName) {
        this.tabManager.showTab(tabName);
    }

    handleFileUpload(event) {
        return this.fileUploadManager.handleFileUpload(event);
    }

    displayProgressTable(firms) {
        this.tableManager.displayProgressTable(firms);
    }

    updateProgress(workflowExecutionId, progress) {
        this.tableManager.updateProgress(workflowExecutionId, progress);
    }

    updateStatus(workflowExecutionId, status, statusClass) {
        this.tableManager.updateStatus(workflowExecutionId, status, statusClass);
    }

    showDownloadButton(workflowExecutionId) {
        this.tableManager.showDownloadButton(workflowExecutionId);
    }

    updateTableWithWorkflowIds(firmNames, workflowExecutionIds) {
        console.log('UIManager updating table with workflow execution IDs:', workflowExecutionIds);
        this.tableManager.createTable(firmNames, workflowExecutionIds);
    }

    displaySavedResults(results) {
        this.tableManager.displaySavedResults(results);
    }

    enableStartButton() {
        this.startButtonManager.enableStartButton();
    }

    disableStartButton() {
        this.startButtonManager.disableStartButton();
    }

    setStartButtonState(text, isRunning = false) {
        this.startButtonManager.setStartButtonState(text, isRunning);
    }

    getStatusClass(status) {
        return this.tableManager.getStatusClass(status);
    }

    handleSavedReportsRequested(event) {
        console.log('UIManager handling saved reports request');
        
        // Forward to WorkflowManager to load saved reports from API
        document.dispatchEvent(new CustomEvent('loadSavedReportsRequested'));
    }

    handleDeleteRequested(event) {
        console.log('UIManager handling delete request:', event.detail);
        
        // Forward to WorkflowManager to handle deletion
        document.dispatchEvent(new CustomEvent('workflowDeleteRequested', {
            detail: event.detail
        }));
    }

    handleSavedReportsLoaded(reports) {
        console.log('UIManager handling saved reports loaded:', reports);
        this.savedReportsManager.handleSavedReportsLoaded(reports);
    }
}