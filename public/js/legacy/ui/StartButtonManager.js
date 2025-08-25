class StartButtonManager {
    constructor(startButtonElement) {
        this.startButton = startButtonElement;
        this.isProcessing = false;
        this.initializeButton();
        this.setupClickHandler();
    }

    initializeButton() {
        this.disableStartButton();
    }

    setupClickHandler() {
        if (this.startButton) {
            this.startButton.addEventListener('click', () => {
                this.handleStartButtonClick();
            });
        }
    }

    handleStartButtonClick() {
        if (!this.startButton.disabled) {
            console.log('Start button clicked');
            document.dispatchEvent(new CustomEvent('startButtonClicked'));
        }
    }

    enableStartButton() {
        if (this.startButton) {
            this.startButton.disabled = false;
            this.startButton.textContent = 'Start Process';
            this.startButton.classList.remove('running');
            this.startButton.classList.add('ready');
        }
    }

    disableStartButton() {
        if (this.startButton) {
            this.startButton.disabled = true;
            this.startButton.textContent = 'Start Process';
            this.startButton.classList.remove('running', 'ready');
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