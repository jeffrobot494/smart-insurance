class FileUploadManager {
    constructor(fileInputElement, uploadButtonElement) {
        this.fileInput = fileInputElement;
        this.uploadButton = uploadButtonElement;
        this.firmNames = [];
        this.setupFileInput();
    }

    setupFileInput() {
        this.uploadButton.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        this.fileInput.addEventListener('change', (event) => {
            this.handleFileUpload(event);
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!this.validateFile(file)) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const firmNames = this.parseCSV(e.target.result);
            if (firmNames.length > 0) {
                this.firmNames = firmNames;
                document.dispatchEvent(new CustomEvent('csvUploaded', {
                    detail: { firmNames }
                }));
            }
        };
        reader.readAsText(file);
    }

    parseCSV(fileContent) {
        if (!fileContent.trim()) {
            document.dispatchEvent(new CustomEvent('csvUploadError', {
                detail: { error: 'CSV file is empty' }
            }));
            return [];
        }
        
        return fileContent.split('\n')
            .filter(line => line.trim())
            .map(line => this.cleanFirmName(line.split(',')[0]))
            .filter(name => name);
    }

    validateFile(file) {
        if (!file) return false;
        return file.type === 'text/csv' || file.name.endsWith('.csv');
    }

    cleanFirmName(rawName) {
        if (!rawName) return '';
        return rawName.replace(/^["']|["']$/g, '').trim();
    }

    getFirmNames() {
        return this.firmNames;
    }

    hasValidData() {
        return this.firmNames.length > 0;
    }

    reset() {
        this.firmNames = [];
        this.fileInput.value = '';
    }
}