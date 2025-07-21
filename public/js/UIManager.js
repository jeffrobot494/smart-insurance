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
        this.progressManager = new ProgressManager();
        this.tableManager = new TableManager(this.elements.tableBody, this.elements.tableSection);
        this.fileUploadManager = new FileUploadManager(this.elements.csvFile, this.elements.uploadBtn);
        this.notificationManager = new NotificationManager();
        
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

    updateProgress(firmId, progress) {
        this.progressManager.updateProgress(firmId, progress);
    }

    updateStatus(firmId, status, statusClass) {
        this.progressManager.updateStatus(firmId, status, statusClass);
    }

    showDownloadButton(firmId) {
        this.tableManager.showDownloadButton(firmId);
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
        return this.progressManager.getStatusClass(status);
    }
}