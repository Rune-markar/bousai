// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '停電時の電力を設計' }));

    const heading = screen.getByRole('heading', { name: '停電時の電力設計' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveFocus();
    expect(container.querySelector('.app-shell')).toHaveClass('power-active');
    expect(document.documentElement).toHaveClass('power-document-active');
    expect(document.body).toHaveClass('power-document-active');

    fireEvent.click(screen.getByRole('tab', { name: '太陽光' }));
    fireEvent.click(screen.getByRole('button', { name: 'ホームへ戻る' }));
    expect(screen.getByText('今日のそなえ状況')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停電時の電力を設計' })).toHaveFocus();
    expect(container.querySelector('.app-shell')).not.toHaveClass('power-active');
    expect(document.documentElement).not.toHaveClass('power-document-active');
    expect(document.body).not.toHaveClass('power-document-active');

    fireEvent.click(screen.getByRole('button', { name: '停電時の電力を設計' }));
    expect(screen.getByRole('tab', { name: '太陽光' })).toHaveAttribute('aria-selected', 'true');
  }, 15000);

  it('アプリをアンマウントするとドキュメント固定を解除する', () => {
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '停電時の電力を設計' }));
    expect(document.documentElement).toHaveClass('power-document-active');
    expect(document.body).toHaveClass('power-document-active');

    unmount();
    expect(document.documentElement).not.toHaveClass('power-document-active');
    expect(document.body).not.toHaveClass('power-document-active');
  });

  it('防災力ページに旧電力プランナーを埋め込まない', () => {
    render(<App />);

    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '防災力' }));

    expect(screen.getByRole('heading', { name: '防災力ロードマップ' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '停電時の電力を、一つの流れで設計' })).not.toBeInTheDocument();
  });
});
