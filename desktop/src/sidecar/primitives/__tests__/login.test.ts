import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performLogin } from '../login';

const mockPage = {
  goto: vi.fn(),
  fill: vi.fn(),
  click: vi.fn(),
  waitForURL: vi.fn(),
  screenshot: vi.fn()
};

const mockBrowser = {
  newPage: vi.fn(async () => mockPage),
  close: vi.fn(async () => undefined)
};

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => mockBrowser)
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('performLogin', () => {
  it('fills credentials and submits', async () => {
    await performLogin({
      loginUrl: 'https://seller.example.com/login',
      username: 'user',
      password: 'pass',
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: 'button[type=submit]'
    });

    expect(mockPage.goto).toHaveBeenCalledWith('https://seller.example.com/login');
    expect(mockPage.fill).toHaveBeenCalledWith('#username', 'user');
    expect(mockPage.fill).toHaveBeenCalledWith('#password', 'pass');
    expect(mockPage.click).toHaveBeenCalledWith('button[type=submit]');
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
