import { describe, it, expect, beforeEach } from 'vitest';
import { useCommandPalette } from '../command-palette';

describe('useCommandPalette', () => {
  beforeEach(() => {
    useCommandPalette.setState({ open: false });
  });

  it('starts closed', () => {
    expect(useCommandPalette.getState().open).toBe(false);
  });

  it('toggles open/close', () => {
    useCommandPalette.getState().toggle();
    expect(useCommandPalette.getState().open).toBe(true);
    useCommandPalette.getState().toggle();
    expect(useCommandPalette.getState().open).toBe(false);
  });

  it('sets open state explicitly', () => {
    useCommandPalette.getState().setOpen(true);
    expect(useCommandPalette.getState().open).toBe(true);
    useCommandPalette.getState().setOpen(false);
    expect(useCommandPalette.getState().open).toBe(false);
  });
});
