class APIClient {
    constructor() {
        this.baseURL = '';
    }

    async startWorkflow(firms) {
        console.log('APIClient.startWorkflow() - TODO: Implement workflow start request');
        return { success: true, workflowId: 'mock-id' };
    }

    async pollProgress() {
        console.log('APIClient.pollProgress() - TODO: Implement progress polling');
        return { inProgress: false, results: [] };
    }

    async getResults(firmId) {
        console.log('APIClient.getResults() - TODO: Implement results fetching');
        return { success: true, data: {} };
    }

    async deleteResults(firmId) {
        console.log('APIClient.deleteResults() - TODO: Implement results deletion');
        return { success: true };
    }

    async getAllResults() {
        console.log('APIClient.getAllResults() - TODO: Implement all results fetching');
        return { success: true, results: [] };
    }
}