/**
 * Patient Data Validation Utilities
 * Handles format validation for common patient fields
 * Extracted from PatientValidationService for better performance
 */

/**
 * Validate phone number (10 digits)
 */
export function isValidPhone(phone: string): boolean {
    return /^\d{10}$/.test(phone.trim());
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Validate patient name (not empty)
 */
export function isValidName(name: string): boolean {
    return name.trim().length > 0;
}

/**
 * Validate date of birth is in the past
 */
export function isValidDateOfBirth(date: Date | string | undefined): boolean {
    if (!date) return true; // Optional field
    const dob = typeof date === 'string' ? new Date(date) : date;
    return dob < new Date();
}

/**
 * Validate gender (optional, but if provided should be valid)
 */
export function isValidGender(gender: string | undefined): boolean {
    if (!gender) return true; // Optional field
    const validGenders = ['Male', 'Female', 'Other'];
    return validGenders.includes(gender);
}

/**
 * Comprehensive patient data validation
 */
export function validatePatientData(data: {
    name?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: Date | string;
    gender?: string;
}): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (data.name && !isValidName(data.name)) {
        errors.push('Patient name is required');
    }

    if (data.phone && !isValidPhone(data.phone)) {
        errors.push('Phone must be 10 digits');
    }

    if (data.email && !isValidEmail(data.email)) {
        errors.push('Invalid email format');
    }

    if (data.dateOfBirth && !isValidDateOfBirth(data.dateOfBirth)) {
        errors.push('Date of birth must be in the past');
    }

    if (data.gender && !isValidGender(data.gender)) {
        errors.push('Invalid gender value');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
