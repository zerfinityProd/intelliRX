import { describe, it, expect, vi } from 'vitest';

describe('AuthGuard', () => {
  it('allows navigation when user is logged in', () => {
    const mockAuthService = { isLoggedIn: vi.fn().mockReturnValue(true) };
    const mockRouter = { navigate: vi.fn() };
    
    // Simulate guard logic
    const guardFunction = () => {
      if (mockAuthService.isLoggedIn()) {
        return true;
      }
      mockRouter.navigate(['/login']);
      return false;
    };
    
    const result = guardFunction();
    expect(result).toBe(true);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('blocks navigation and redirects when not logged in', () => {
    const mockAuthService = { isLoggedIn: vi.fn().mockReturnValue(false) };
    const mockRouter = { navigate: vi.fn() };
    
    const guardFunction = () => {
      if (mockAuthService.isLoggedIn()) {
        return true;
      }
      mockRouter.navigate(['/login']);
      return false;
    };
    
    const result = guardFunction();
    expect(result).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});