// Login page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-button');
    const buttonText = loginButton.querySelector('.button-text');
    const loadingSpinner = loginButton.querySelector('.loading-spinner');
    const errorMessage = document.getElementById('error-message');

    // Focus password input on page load
    passwordInput.focus();

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const password = passwordInput.value.trim();
        
        if (!password) {
            showError('Please enter a password');
            return;
        }

        // Show loading state
        setLoading(true);
        hideError();

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Success - redirect to main app
                window.location.href = '/';
            } else {
                // Show error message
                showError(data.error || 'Login failed');
                passwordInput.select(); // Select password for easy re-entry
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    });

    // Handle Enter key press
    passwordInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });

    // Clear error when user starts typing
    passwordInput.addEventListener('input', function() {
        hideError();
    });

    function setLoading(loading) {
        loginButton.disabled = loading;
        loginButton.classList.toggle('loading', loading);
        
        if (loading) {
            buttonText.style.opacity = '0';
            loadingSpinner.style.display = 'inline-block';
        } else {
            buttonText.style.opacity = '1';
            loadingSpinner.style.display = 'none';
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Add shake animation
        errorMessage.style.animation = 'none';
        setTimeout(() => {
            errorMessage.style.animation = 'shake 0.5s ease-in-out';
        }, 10);
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }
});

// Add shake animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
        20%, 40%, 60%, 80% { transform: translateX(3px); }
    }
`;
document.head.appendChild(style);