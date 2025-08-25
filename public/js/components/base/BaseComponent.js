// Smart Insurance - Base Component Class

class BaseComponent {
    constructor(data = null, callbacks = {}) {
        this.data = data;
        this.callbacks = callbacks;
        this.element = null;
        this.isRendered = false;
    }
    
    render() {
        throw new Error('render() must be implemented by subclass');
    }
    
    update(data) {
        throw new Error('update() must be implemented by subclass');
    }
    
    destroy() {
        // 1. Remove own event listeners first
        this.unbindEvents();
        
        // 2. Destroy all child components
        this.destroyChildren();
        
        // 3. Remove DOM element
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.isRendered = false;
    }
    
    unbindEvents() {
        // Override in subclasses to remove specific event listeners
        // Example: this.element.removeEventListener('click', this.clickHandler);
    }
    
    destroyChildren() {
        // Override in subclasses to destroy child components
        // Example: this.childComponents.forEach(child => child.destroy());
    }
    
    createElement(tag, className = '', attributes = {}) {
        return Utils.createElement(tag, className, attributes);
    }
    
    bindEvents() {
        // Override in subclasses that need event handling
        // Use this.callbacks for parent communication
    }
    
    // Trigger callback to parent component
    triggerCallback(eventName, ...args) {
        if (this.callbacks[eventName]) {
            this.callbacks[eventName](...args);
        }
    }
}

// Make BaseComponent available globally
window.BaseComponent = BaseComponent;