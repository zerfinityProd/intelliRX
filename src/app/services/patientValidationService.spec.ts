import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientValidationService } from './patientValidationService';

describe('PatientValidationService', () => {
    let service: PatientValidationService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(PatientValidationService);
    });

    describe('Phone Validation', () => {
        it('should validate correct 10-digit phone', () => {
            expect(service.isValidPhone('5551234567')).toBe(true);
        });

        it('should reject phone with less than 10 digits', () => {
            expect(service.isValidPhone('555123456')).toBe(false);
        });

        it('should reject phone with more than 10 digits', () => {
            expect(service.isValidPhone('55512345678')).toBe(false);
        });

        it('should reject phone with non-digits', () => {
            expect(service.isValidPhone('555-123-4567')).toBe(false);
        });

        it('should reject phone with spaces', () => {
            expect(service.isValidPhone('555 123 4567')).toBe(false);
        });

        it('should trim whitespace before validating', () => {
            expect(service.isValidPhone('  5551234567  ')).toBe(true);
        });
    });

    describe('Email Validation', () => {
        it('should validate correct email format', () => {
            expect(service.isValidEmail('test@example.com')).toBe(true);
        });

        it('should validate email with subdomain', () => {
            expect(service.isValidEmail('user@mail.example.com')).toBe(true);
        });

        it('should reject email without @', () => {
            expect(service.isValidEmail('testexample.com')).toBe(false);
        });

        it('should reject email without domain', () => {
            expect(service.isValidEmail('test@')).toBe(false);
        });

        it('should reject email without extension', () => {
            expect(service.isValidEmail('test@example')).toBe(false);
        });

        it('should reject email with spaces', () => {
            expect(service.isValidEmail('test @example.com')).toBe(false);
        });

        it('should trim whitespace before validating', () => {
            expect(service.isValidEmail('  test@example.com  ')).toBe(true);
        });
    });

    describe('Name Validation', () => {
        it('should validate non-empty name', () => {
            expect(service.isValidName('John Doe')).toBe(true);
        });

        it('should reject empty name', () => {
            expect(service.isValidName('')).toBe(false);
        });

        it('should reject name with only spaces', () => {
            expect(service.isValidName('   ')).toBe(false);
        });

        it('should accept single name', () => {
            expect(service.isValidName('John')).toBe(true);
        });
    });

    describe('Date of Birth Validation', () => {
        it('should accept past date', () => {
            const pastDate = new Date('1990-01-01');
            expect(service.isValidDateOfBirth(pastDate)).toBe(true);
        });

        it('should reject future date', () => {
            const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            expect(service.isValidDateOfBirth(futureDate)).toBe(false);
        });

        it('should accept undefined (optional field)', () => {
            expect(service.isValidDateOfBirth(undefined)).toBe(true);
        });

        it('should accept date string', () => {
            expect(service.isValidDateOfBirth('1990-01-01')).toBe(true);
        });
    });

    describe('Gender Validation', () => {
        it('should accept valid genders', () => {
            expect(service.isValidGender('Male')).toBe(true);
            expect(service.isValidGender('Female')).toBe(true);
            expect(service.isValidGender('Other')).toBe(true);
        });

        it('should reject invalid gender', () => {
            expect(service.isValidGender('Unknown')).toBe(false);
        });

        it('should accept undefined (optional field)', () => {
            expect(service.isValidGender(undefined)).toBe(true);
        });
    });

    describe('Comprehensive Validation', () => {
        it('should return valid for complete correct data', () => {
            const result = service.validatePatientData({
                name: 'John Doe',
                phone: '5551234567',
                email: 'john@example.com',
                gender: 'Male'
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should collect all validation errors', () => {
            const result = service.validatePatientData({
                name: '',
                phone: '555',
                email: 'invalid-email',
                gender: 'Invalid'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should validate optional fields correctly', () => {
            const result = service.validatePatientData({
                name: 'John Doe',
                phone: '5551234567'
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
});
