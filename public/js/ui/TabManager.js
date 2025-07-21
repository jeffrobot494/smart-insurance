class TabManager {
    constructor(tabButtonElements, tabContentElements) {
        this.tabButtons = tabButtonElements;
        this.tabContents = tabContentElements;
        this.setupTabEventListeners();
    }

    setupTabEventListeners() {
        this.tabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const tabName = event.target.textContent.toLowerCase();
                this.showTab(tabName);
            });
        });
    }

    showTab(tabName) {
        // Hide all tab contents
        this.tabContents.forEach(content => {
            content.classList.remove('active');
        });
        
        // Remove active class from all tab buttons
        this.tabButtons.forEach(button => {
            button.classList.remove('active');
        });
        
        // Show selected tab content
        const targetTab = document.getElementById(tabName + '-tab');
        if (targetTab) {
            targetTab.classList.add('active');
        }
        
        // Find and activate the corresponding tab button
        this.tabButtons.forEach(button => {
            if (button.textContent.toLowerCase() === tabName) {
                button.classList.add('active');
            }
        });
    }

    handleTabClick(event) {
        // Extract tab name from button text and call showTab - matches UIManager pattern
    }

    getActiveTab() {
        // Return the name of currently active tab by checking active classes
    }

    activateTabButton(tabName) {
        // Find and activate the tab button that matches the tab name
    }

    activateTabContent(tabName) {
        // Show the tab content that matches the tab name
    }
}