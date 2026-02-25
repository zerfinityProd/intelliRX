import { Injectable } from '@angular/core';

/**
 * AuthErrorService
 * Centralized error handling for authentication operations
 * Maps Firebase authentication error codes to user-friendly messages
 */
@Injectable({
    providedIn: 'root'
})
export class AuthErrorService {

    /**
     * Handle Firebase authentication errors and map them to user-friendly messages
     * @param error - The Firebase authentication error object
     * @returns Error object with user-friendly message
     */
    handleAuthError(error: any): Error {
        let message = 'An error occurred during authentication';

        switch (error.code) {
            case 'auth/email-already-in-use':
                message = 'This email is already registered';
                break;
            case 'auth/invalid-email':
                message = 'Invalid email address';
                break;
            case 'auth/operation-not-allowed':
                message = 'This operation is not allowed';
                break;
            case 'auth/weak-password':
                message = 'Password is too weak. Use at least 6 characters';
                break;
            case 'auth/user-disabled':
                message = 'This account has been disabled';
                break;
            case 'auth/user-not-found':
                message = 'No account found with this email';
                break;
            case 'auth/wrong-password':
                message = 'Incorrect password';
                break;
            case 'auth/invalid-credential':
                message = 'Invalid email or password';
                break;
            case 'auth/too-many-requests':
                message = 'Too many attempts. Please try again later';
                break;
            case 'auth/network-request-failed':
                message = 'Network error. Please check your connection';
                break;
            case 'auth/popup-closed-by-user':
                message = 'Sign-in popup was closed';
                break;
            default:
                message = error.message || message;
        }

        return new Error(message);
    }

    /**
     * Check if an error is a known auth error
     * @param error - The error to check
     * @returns True if it's a Firebase auth error
     */
    isAuthError(error: any): boolean {
        return error?.code && error.code.startsWith('auth/');
    }
}
