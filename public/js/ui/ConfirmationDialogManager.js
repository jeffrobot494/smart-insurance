class ConfirmationDialogManager {
    constructor(dialogElement, firmsListElement, confirmButtonElement, cancelButtonElement) {
        this.dialog = dialogElement;
        this.firmsList = firmsListElement;
        this.confirmButton = confirmButtonElement;
        this.cancelButton = cancelButtonElement;
        this.pendingFirmNames = [];
        this.setupDialog();
    }

    setupDialog() {
        this.confirmButton.addEventListener('click', () => {
            this.handleConfirm();
        });
        
        this.cancelButton.addEventListener('click', () => {
            this.handleCancel();
        });
        
        // Close dialog when clicking outside of it
        this.dialog.addEventListener('click', (event) => {
            if (event.target === this.dialog) {
                this.handleCancel();
            }
        });
        
        // Close dialog with Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isVisible()) {
                this.handleCancel();
            }
        });
    }

    showConfirmation(firmNames) {
        this.pendingFirmNames = firmNames;
        this.populateFirmsList(firmNames);
        this.showDialog();
    }

    populateFirmsList(firmNames) {
        this.firmsList.innerHTML = '';
        firmNames.forEach(name => {
            const listItem = document.createElement('li');
            listItem.textContent = name;
            this.firmsList.appendChild(listItem);
        });
        
        // Update dialog text based on count
        const countText = this.dialog.querySelector('p');
        if (countText) {
            countText.textContent = `We found ${firmNames.length} firm${firmNames.length !== 1 ? 's' : ''}:`;
        }
    }

    showDialog() {
        this.dialog.classList.add('visible');
        document.body.classList.add('dialog-open');
        // Focus the confirm button for better UX
        setTimeout(() => this.confirmButton.focus(), 100);
    }

    hideDialog() {
        this.dialog.classList.remove('visible');
        document.body.classList.remove('dialog-open');
        this.pendingFirmNames = [];
    }

    handleConfirm() {
        if (this.pendingFirmNames.length > 0) {
            // Fire the same event that CSV upload uses
            document.dispatchEvent(new CustomEvent('csvUploaded', {
                detail: { firmNames: this.pendingFirmNames }
            }));
        }
        this.hideDialog();
    }

    handleCancel() {
        // Fire event to let TextInputManager know user cancelled
        document.dispatchEvent(new CustomEvent('confirmationCancelled'));
        this.hideDialog();
    }

    isVisible() {
        return this.dialog.classList.contains('visible');
    }
}