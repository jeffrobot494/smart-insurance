// Smart Insurance - Pagination Component

class PaginationComponent extends BaseComponent {
    constructor(options = {}) {
        super({}, {});
        this.currentPage = options.currentPage || 1;
        this.totalPages = options.totalPages || 1;
        this.totalItems = options.totalItems || 0;
        this.itemsPerPage = options.itemsPerPage || 10;
        this.onPageChange = options.onPageChange || (() => {});
        
        // Display options
        this.maxVisiblePages = 5; // Show max 5 page numbers at once
    }
    
    render() {
        this.element = this.createElement('div', 'pagination-container');
        
        if (this.totalPages <= 1) {
            this.element.innerHTML = `
                <div class="pagination-info">
                    Showing ${this.totalItems} pipeline${this.totalItems !== 1 ? 's' : ''}
                </div>
            `;
            return this.element;
        }
        
        // Calculate range for items
        const startItem = ((this.currentPage - 1) * this.itemsPerPage) + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
        
        this.element.innerHTML = `
            <div class="pagination-info">
                Showing ${startItem}-${endItem} of ${this.totalItems} pipelines
            </div>
            <div class="pagination-controls">
                ${this.renderPageControls()}
            </div>
        `;
        
        this.bindEvents();
        this.isRendered = true;
        return this.element;
    }
    
    renderPageControls() {
        const controls = [];
        
        // Previous button
        if (this.currentPage > 1) {
            controls.push(`
                <button class="pagination-btn" data-page="${this.currentPage - 1}">
                    ← Previous
                </button>
            `);
        }
        
        // Calculate visible page range
        const { startPage, endPage } = this.calculateVisibleRange();
        
        // First page + ellipsis if needed
        if (startPage > 1) {
            controls.push(`<button class="pagination-btn page-number" data-page="1">1</button>`);
            if (startPage > 2) {
                controls.push(`<span class="pagination-ellipsis">...</span>`);
            }
        }
        
        // Page numbers
        for (let page = startPage; page <= endPage; page++) {
            const isActive = page === this.currentPage;
            controls.push(`
                <button class="pagination-btn page-number ${isActive ? 'active' : ''}" 
                        data-page="${page}" ${isActive ? 'disabled' : ''}>
                    ${page}
                </button>
            `);
        }
        
        // Last page + ellipsis if needed
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                controls.push(`<span class="pagination-ellipsis">...</span>`);
            }
            controls.push(`
                <button class="pagination-btn page-number" data-page="${this.totalPages}">
                    ${this.totalPages}
                </button>
            `);
        }
        
        // Next button
        if (this.currentPage < this.totalPages) {
            controls.push(`
                <button class="pagination-btn" data-page="${this.currentPage + 1}">
                    Next →
                </button>
            `);
        }
        
        return controls.join('');
    }
    
    calculateVisibleRange() {
        const halfVisible = Math.floor(this.maxVisiblePages / 2);
        let startPage = Math.max(1, this.currentPage - halfVisible);
        let endPage = Math.min(this.totalPages, this.currentPage + halfVisible);
        
        // Adjust if we're near the beginning or end
        if (endPage - startPage + 1 < this.maxVisiblePages) {
            if (startPage === 1) {
                endPage = Math.min(this.totalPages, startPage + this.maxVisiblePages - 1);
            } else {
                startPage = Math.max(1, endPage - this.maxVisiblePages + 1);
            }
        }
        
        return { startPage, endPage };
    }
    
    bindEvents() {
        if (this.element) {
            this.clickHandler = (event) => {
                const target = event.target;
                if (target.classList.contains('pagination-btn') && target.dataset.page) {
                    event.preventDefault();
                    const newPage = parseInt(target.dataset.page);
                    if (newPage !== this.currentPage && !target.disabled) {
                        this.goToPage(newPage);
                    }
                }
            };
            this.element.addEventListener('click', this.clickHandler);
        }
    }
    
    unbindEvents() {
        if (this.element && this.clickHandler) {
            this.element.removeEventListener('click', this.clickHandler);
        }
    }
    
    goToPage(page) {
        if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
            this.currentPage = page;
            this.onPageChange(page);
            this.update();
        }
    }
    
    update(options = {}) {
        // Update properties if provided
        if (options.currentPage !== undefined) this.currentPage = options.currentPage;
        if (options.totalPages !== undefined) this.totalPages = options.totalPages;
        if (options.totalItems !== undefined) this.totalItems = options.totalItems;
        if (options.itemsPerPage !== undefined) this.itemsPerPage = options.itemsPerPage;
        
        if (this.isRendered && this.element) {
            // Re-render the component
            const parent = this.element.parentNode;
            this.destroy();
            const newElement = this.render();
            if (parent) {
                parent.appendChild(newElement);
            }
        }
    }
    
    // Utility methods
    getTotalPages() {
        return this.totalPages;
    }
    
    getCurrentPage() {
        return this.currentPage;
    }
    
    getItemsPerPage() {
        return this.itemsPerPage;
    }
    
    // Calculate if there are more pages
    hasNextPage() {
        return this.currentPage < this.totalPages;
    }
    
    hasPreviousPage() {
        return this.currentPage > 1;
    }
}

// Make PaginationComponent available globally
window.PaginationComponent = PaginationComponent;