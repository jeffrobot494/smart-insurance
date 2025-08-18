class TextInputManager {
    constructor(textAreaElement, processButtonElement) {
        this.textArea = textAreaElement;
        this.processButton = processButtonElement;
        this.firmNames = [];
        this.setupTextInput();
    }

    setupTextInput() {
        this.processButton.addEventListener('click', () => {
            this.handleTextInput();
        });
        
        // Also allow processing when Enter is pressed in textarea
        this.textArea.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'Enter') {
                this.handleTextInput();
            }
        });
    }

    handleTextInput() {
        const text = this.textArea.value.trim();
        if (!this.validateInput(text)) return;
        
        const firmNames = this.parseText(text);
        if (firmNames.length > 0) {
            this.firmNames = firmNames;
            document.dispatchEvent(new CustomEvent('textParsed', {
                detail: { firmNames }
            }));
        }
    }

    parseText(text) {
        if (!text.trim()) {
            document.dispatchEvent(new CustomEvent('textInputError', {
                detail: { error: 'Please enter some firm names' }
            }));
            return [];
        }
        
        return text.split(',')
            .map(name => this.cleanFirmName(name))
            .filter(name => name.length > 0);
    }

    validateInput(text) {
        if (!text) {
            document.dispatchEvent(new CustomEvent('textInputError', {
                detail: { error: 'Please enter some firm names' }
            }));
            return false;
        }
        return true;
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
        this.textArea.value = '';
    }

    clearInput() {
        this.textArea.value = '';
    }
}