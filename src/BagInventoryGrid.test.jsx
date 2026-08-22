// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BagInventoryGrid, { buildBagInventoryLayout } from './BagInventoryGrid.jsx';

describe('避難バッグ容量グリッド', () => {
  it('商品の収納容量に比例した面積を割り当て、空き容量も残す', () => {
    const layout = buildBagInventoryLayout([
      { id: 'large', name: '大きい商品', totalMl: 6000 },
      { id: 'small', name: '小さい商品', totalMl: 1500 },
    ], 10000);
    const area = (id) => {
      const item = layout.find((entry) => entry.layoutId === id);
      return item.width * item.height;
    };

    expect(area('large') / area('small')).toBeCloseTo(4, 5);
    expect(area('available-space')).toBeCloseTo(2500, 5);
  });

  it('品名、数量、容量を読み上げ可能なアイテムボックスとして表示する', () => {
    render(<BagInventoryGrid items={[{ id: 'water', name: '飲料水', category: 'water', quantity: 2, unit: '本', totalMl: 1200 }]} usableCapacityMl={2000} />);
    expect(screen.getByRole('list', { name: '避難バッグの容量配置' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '飲料水 2本 収納容量1.20リットル' })).toBeInTheDocument();
    expect(screen.getByText('空き')).toBeInTheDocument();
  });
});
