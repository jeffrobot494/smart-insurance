let firms = [];
let isProcessing = false;
let currentProcessingIndex = 0;

const progressMessages = [
    "Finding portfolio page...",
    "Finding active companies...",
    "Scraping company names...",
    "Getting legal names...",
    "Collecting Form 5500 records...",
    "Collecting Schedule A attachments...",
    "Finalizing report..."
];

document.getElementById('csvFile').addEventListener('change', handleFileUpload);
document.getElementById('startBtn').addEventListener('click', startProcessing);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Simulate reading CSV file and create fake data
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split('\n').filter(line => line.trim());
        
        // Extract firm names (assuming first column or single column)
        firms = lines.map((line, index) => {
            let name = line.split(',')[0].trim();
            // Remove quotes if present
            name = name.replace(/^["']|["']$/g, '');
            
            return {
                id: index,
                name: name || `Firm ${index + 1}`,
                progress: "",
                status: "Waiting"
            };
        });
        
        // If no valid firms found, create sample data
        if (firms.length === 0) {
            firms = [
                { id: 0, name: "Sample Firm 1", progress: "", status: "Waiting" },
                { id: 1, name: "Sample Firm 2", progress: "", status: "Waiting" },
                { id: 2, name: "Sample Firm 3", progress: "", status: "Waiting" }
            ];
        }
        
        displayTable();
        enableStartButton();
    };
    
    reader.readAsText(file);
}

function displayTable() {
    const tableSection = document.getElementById('tableSection');
    const tableBody = document.getElementById('tableBody');
    
    tableBody.innerHTML = '';
    
    firms.forEach(firm => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${firm.name}</td>
            <td class="progress-text" id="progress-${firm.id}">${firm.progress}</td>
            <td>
                <span class="status-waiting" id="status-${firm.id}">${firm.status}</span>
                <div id="download-${firm.id}" style="display: none;">
                    <button class="download-btn" onclick="downloadReport(${firm.id})">Download</button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    tableSection.style.display = 'block';
}

function enableStartButton() {
    const startBtn = document.getElementById('startBtn');
    startBtn.disabled = false;
    startBtn.textContent = 'Start Process';
}

async function startProcessing() {
    if (isProcessing) return;
    
    isProcessing = true;
    currentProcessingIndex = 0;
    
    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = 'Processing...';
    startBtn.classList.add('running');
    startBtn.disabled = true;
    
    // Reset all firms to waiting status
    firms.forEach(firm => {
        firm.progress = "";
        firm.status = "Waiting";
        updateFirmDisplay(firm.id);
    });
    
    // Process each firm sequentially
    for (let i = 0; i < firms.length; i++) {
        await processFirm(i);
    }
    
    // Processing complete
    startBtn.textContent = 'Process Complete';
    startBtn.classList.remove('running');
    isProcessing = false;
}

async function processFirm(firmIndex) {
    const firm = firms[firmIndex];
    
    // Update status to "In Progress"
    firm.status = "In Progress";
    updateStatusDisplay(firm.id, "In Progress", "status-progress");
    
    // Simulate progress updates
    for (let i = 0; i < progressMessages.length; i++) {
        firm.progress = progressMessages[i];
        updateProgressDisplay(firm.id, firm.progress);
        
        // Random delay between 800-1500ms for each step
        await delay(800 + Math.random() * 700);
    }
    
    // Mark as complete
    firm.status = "Complete";
    firm.progress = "Analysis complete";
    updateStatusDisplay(firm.id, "Complete", "status-complete");
    updateProgressDisplay(firm.id, firm.progress);
    
    // Show download button
    document.getElementById(`download-${firm.id}`).style.display = 'inline-block';
    
    // Brief pause before starting next firm
    await delay(500);
}

function updateFirmDisplay(firmId) {
    const firm = firms[firmId];
    updateProgressDisplay(firmId, firm.progress);
    updateStatusDisplay(firmId, firm.status, getStatusClass(firm.status));
}

function updateProgressDisplay(firmId, progress) {
    const progressElement = document.getElementById(`progress-${firmId}`);
    progressElement.textContent = progress;
}

function updateStatusDisplay(firmId, status, className) {
    const statusElement = document.getElementById(`status-${firmId}`);
    statusElement.textContent = status;
    statusElement.className = className;
}

function getStatusClass(status) {
    switch (status) {
        case "Waiting": return "status-waiting";
        case "In Progress": return "status-progress";
        case "Complete": return "status-complete";
        default: return "status-waiting";
    }
}

function downloadReport(firmId) {
    const firm = firms[firmId];
    
    // Create a fake download
    const element = document.createElement('a');
    const content = `Insurance Analysis Report for ${firm.name}\n\nGenerated on: ${new Date().toLocaleDateString()}\n\nThis is a sample report for demonstration purposes.`;
    const file = new Blob([content], { type: 'text/plain' });
    
    element.href = URL.createObjectURL(file);
    element.download = `${firm.name.replace(/[^a-z0-9]/gi, '_')}_insurance_report.txt`;
    element.style.display = 'none';
    
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}