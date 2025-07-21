class StartButtonManager {
    constructor(startButtonElement) {
        this.startButton = startButtonElement;
        this.isProcessing = false;
        this.initializeButton();
    }

    initializeButton() {
        this.disableStartButton();
    }

    setupClickHandler(onStartCallback) {
        // Add click event listener that calls the provided callback function
    }

    enableStartButton() {
        if (this.startButton) {
            this.startButton.disabled = false;
            this.startButton.textContent = 'Start Process';
            this.startButton.classList.remove('running');
        }
    }

    disableStartButton() {
        if (this.startButton) {
            this.startButton.disabled = true;
            this.startButton.textContent = 'Start Process';
            this.startButton.classList.remove('running');
        }
    }

    setStartButtonState(text, isRunning = false) {
        if (this.startButton) {
            this.startButton.textContent = text;
            if (isRunning) {
                this.startButton.classList.add('running');
                this.startButton.disabled = true;
            } else {
                this.startButton.classList.remove('running');
            }
        }
    }

    isEnabled() {
        return this.startButton && !this.startButton.disabled;
    }

    reset() {
        this.disableStartButton();
    }
}