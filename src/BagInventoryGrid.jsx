const symbolForCategory = (category) => category === 'water' ? '💧' : category === 'food' ? '🍚' : category === 'hygiene' ? '🧼' : category === 'light' ? '🔋' : '📦';

function splitLayout(nodes, x, y, width, height) {
  if (!nodes.length) return [];
  if (nodes.length === 1) return [{ ...nodes[0], x, y, width, height }];
  const total = nodes.reduce((sum, node) => sum + node.value, 0);
  let splitAt = 1;
  let running = nodes[0].value;
  let closest = Math.abs(total / 2 - running);
  for (let index = 1; index < nodes.length - 1; index += 1) {
    running += nodes[index].value;
    const distance = Math.abs(total / 2 - running);
    if (distance > closest) break;
    closest = distance;
    splitAt = index + 1;
  }
  const first = nodes.slice(0, splitAt);
  const second = nodes.slice(splitAt);
  const firstTotal = first.reduce((sum, node) => sum + node.value, 0);
  const ratio = total ? firstTotal / total : 0.5;
  if (width >= height) {
    const firstWidth = width * ratio;
    return [
      ...splitLayout(first, x, y, firstWidth, height),
      ...splitLayout(second, x + firstWidth, y, width - firstWidth, height),
    ];
  }
  const firstHeight = height * ratio;
  return [
    ...splitLayout(first, x, y, width, firstHeight),
    ...splitLayout(second, x, y + firstHeight, width, height - firstHeight),
  ];
}

export function buildBagInventoryLayout(items = [], usableCapacityMl = 0) {
  const capacity = Math.max(0, Number(usableCapacityMl) || 0);
  if (!capacity) return [];
  const packed = items.map((item, index) => ({
    ...item,
    layoutId: item.id || `item-${index}`,
    value: Math.min(capacity, Math.max(1, Number(item.totalMl) || 0)),
    order: index,
  })).filter((item) => item.value > 0);
  const used = Math.min(capacity, packed.reduce((sum, item) => sum + item.value, 0));
  const nodes = [...packed];
  if (capacity - used > 0) nodes.push({ layoutId: 'available-space', value: capacity - used, empty: true, order: packed.length });
  return splitLayout(nodes.sort((a, b) => b.value - a.value), 0, 0, 100, 100);
}

export default function BagInventoryGrid({ items = [], usableCapacityMl = 0, runId = 0, animate = false, compact = false, label = '避難バッグの容量配置' }) {
  const layout = buildBagInventoryLayout(items, usableCapacityMl);
  return <div className={`bag-inventory-grid${compact ? ' compact' : ''}`} role="list" aria-label={label}>
    {layout.map((entry) => {
      const style = {
        left: `${entry.x}%`, top: `${entry.y}%`, width: `${entry.width}%`, height: `${entry.height}%`, '--pack-order': entry.order,
      };
      if (entry.empty) return <span key="available-space" className="bag-grid-empty-space" style={style}><b>空き</b><small>{(entry.value / 1000).toFixed(1)}L</small></span>;
      const compactTile = entry.width * entry.height < 650;
      return <article
        key={`${runId}-${entry.layoutId}`}
        className={`bag-grid-item category-${entry.category || 'comfort'}${compactTile ? ' compact-tile' : ''}${animate ? ' entering' : ''}`}
        style={style}
        role="listitem"
        aria-label={`${entry.name} ${entry.quantity}${entry.unit} 収納容量${(entry.totalMl / 1000).toFixed(2)}リットル`}
      >
        <span aria-hidden="true">{symbolForCategory(entry.category)}</span>
        <b>{entry.name}</b>
        <small>{entry.quantity}{entry.unit}・{(entry.totalMl / 1000).toFixed(2)}L</small>
      </article>;
    })}
  </div>;
}
