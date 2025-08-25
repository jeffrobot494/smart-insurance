// Smart Insurance - Company Manager  
// Phase 3 implementation - Business logic layer for company operations

class CompanyManager {
    constructor(api) {
        this.api = api;
    }

    // Comprehensive company validation
    validateCompanyName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Company name is required' };
        }
        
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return { valid: false, error: 'Company name cannot be empty' };
        }
        
        if (trimmedName.length > 200) {
            return { valid: false, error: 'Company name must be less than 200 characters' };
        }
        
        return { valid: true, value: trimmedName };
    }

    validateLegalEntityName(legalName) {
        if (!legalName) {
            return { valid: true, value: null }; // Optional field
        }
        
        if (typeof legalName !== 'string') {
            return { valid: false, error: 'Legal entity name must be text' };
        }
        
        const trimmedName = legalName.trim();
        if (trimmedName.length > 200) {
            return { valid: false, error: 'Legal entity name must be less than 200 characters' };
        }
        
        return { valid: true, value: trimmedName || null };
    }

    validateCity(city) {
        if (!city) {
            return { valid: true, value: null }; // Optional field
        }
        
        if (typeof city !== 'string') {
            return { valid: false, error: 'City must be text' };
        }
        
        const trimmedCity = city.trim();
        if (trimmedCity.length > 100) {
            return { valid: false, error: 'City must be less than 100 characters' };
        }
        
        return { valid: true, value: trimmedCity || null };
    }

    validateState(state) {
        if (!state) {
            return { valid: true, value: null }; // Optional field
        }
        
        if (typeof state !== 'string') {
            return { valid: false, error: 'State must be text' };
        }
        
        const trimmedState = state.trim();
        if (trimmedState.length > 100) {
            return { valid: false, error: 'State must be less than 100 characters' };
        }
        
        return { valid: true, value: trimmedState || null };
    }

    // Comprehensive company data validation
    validateCompanyData(companyData) {
        const errors = [];
        const validatedData = {};

        // Validate name (required)
        const nameValidation = this.validateCompanyName(companyData.name);
        if (!nameValidation.valid) {
            errors.push(nameValidation.error);
        } else {
            validatedData.name = nameValidation.value;
        }

        // Validate legal entity name (optional)
        const legalValidation = this.validateLegalEntityName(companyData.legal_entity_name);
        if (!legalValidation.valid) {
            errors.push(legalValidation.error);
        } else {
            validatedData.legal_entity_name = legalValidation.value;
        }

        // Validate city (optional)
        const cityValidation = this.validateCity(companyData.city);
        if (!cityValidation.valid) {
            errors.push(cityValidation.error);
        } else {
            validatedData.city = cityValidation.value;
        }

        // Validate state (optional)
        const stateValidation = this.validateState(companyData.state);
        if (!stateValidation.valid) {
            errors.push(stateValidation.error);
        } else {
            validatedData.state = stateValidation.value;
        }

        // Validate exited status
        validatedData.exited = Boolean(companyData.exited);

        // Set default confidence level if not provided
        validatedData.confidence_level = companyData.confidence_level || 'medium';

        return {
            valid: errors.length === 0,
            errors,
            data: validatedData
        };
    }

    // Business logic for confidence levels
    calculateConfidenceLevel(company, context = {}) {
        // This is business logic for determining confidence in legal entity resolution
        if (!company.legal_entity_name) {
            return 'low'; // No legal entity found
        }

        // High confidence: exact name match
        if (company.legal_entity_name.toLowerCase() === company.name.toLowerCase()) {
            return 'high';
        }

        // Medium confidence: similar names with common business suffixes
        const businessSuffixes = ['LLC', 'INC', 'CORP', 'LTD', 'LP', 'COMPANY'];
        const companyNameBase = this.removeBusinessSuffixes(company.name);
        const legalNameBase = this.removeBusinessSuffixes(company.legal_entity_name);
        
        if (companyNameBase.toLowerCase() === legalNameBase.toLowerCase()) {
            return 'high';
        }

        // Check similarity
        const similarity = this.calculateNameSimilarity(companyNameBase, legalNameBase);
        if (similarity > 0.8) {
            return 'medium';
        }

        return 'low';
    }

    removeBusinessSuffixes(name) {
        const suffixes = ['LLC', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'LTD', 'LIMITED', 'LP', 'COMPANY', 'CO'];
        let cleanName = name.toUpperCase();
        
        suffixes.forEach(suffix => {
            const regex = new RegExp(`\\b${suffix}\\b`, 'g');
            cleanName = cleanName.replace(regex, '');
        });
        
        return cleanName.trim();
    }

    calculateNameSimilarity(str1, str2) {
        // Simple similarity calculation - could be enhanced
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) {
            return 1.0;
        }
        
        const editDistance = this.levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
        return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    // Normalize company data with business rules
    normalizeCompanyData(companyData) {
        const validation = this.validateCompanyData(companyData);
        if (!validation.valid) {
            throw new Error(`Invalid company data: ${validation.errors.join(', ')}`);
        }

        const normalized = { ...validation.data };
        
        // Apply business rules
        normalized.name = this.capitalizeCompanyName(normalized.name);
        if (normalized.legal_entity_name) {
            normalized.legal_entity_name = normalized.legal_entity_name.toUpperCase();
        }
        
        if (normalized.city) {
            normalized.city = this.capitalizeWords(normalized.city);
        }
        
        if (normalized.state) {
            normalized.state = normalized.state.toUpperCase();
        }

        // Recalculate confidence level with business logic
        normalized.confidence_level = this.calculateConfidenceLevel(normalized);

        return normalized;
    }

    capitalizeCompanyName(name) {
        // Capitalize first letter of each word, but preserve existing capitalization
        // for acronyms and special cases
        return name.split(' ').map(word => {
            if (word.length <= 1) return word.toUpperCase();
            if (word === word.toUpperCase()) return word; // Preserve acronyms
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }

    capitalizeWords(text) {
        return text.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }
}

window.CompanyManager = CompanyManager;