// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

describe('電力設計ページの導線', () => {
  beforeEach(() => {
    if (!globalThis.localStorage) {
      const values = new Map();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          clear: () => values.clear(),
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => { values.set(key, String(value)); },
        },
      });
    }
    localStorage.clear();
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('ホームから専用ページを開き、戻るとホームへ戻る', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '停電時の電力を設計' }));

    expect(screen.getByRole('heading', { name: '停電時の電力設計' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ホームへ戻る' }));
    expect(screen.getByText('今日のそなえ状況')).toBeInTheDocument();
  });
});
