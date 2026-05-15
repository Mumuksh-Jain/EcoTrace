'use strict';

const { detectCycle } = require('../../src/utils/cycle');

// Mock the pool — we test the query logic, not the DB connection
function makePool(rows = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

describe('detectCycle', () => {

  // ─── No-cycle cases ───────────────────────────────────────────────────────

  test('returns no cycle when lineage_graph is empty (no ancestors found)', async () => {
    const mockPool = makePool([]); // no rows → proposed child not found in ancestors
    const result = await detectCycle(mockPool, ['batch_a', 'batch_b'], 'child_x');
    expect(result.hasCycle).toBe(false);
    expect(result.reason).toBeNull();
  });

  test('returns no cycle and skips DB query when parentBatchIds is empty', async () => {
    const mockPool = makePool();
    const result = await detectCycle(mockPool, [], 'child_x');
    expect(result.hasCycle).toBe(false);
    expect(result.reason).toBeNull();
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test('returns no cycle and skips DB query when parentBatchIds is null', async () => {
    const mockPool = makePool();
    const result = await detectCycle(mockPool, null, 'child_x');
    expect(result.hasCycle).toBe(false);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  // ─── Cycle detected cases ─────────────────────────────────────────────────

  test('detects cycle when proposed child appears as an ancestor', async () => {
    // DB returns a row → child IS in the ancestor set
    const mockPool = makePool([{ batch_id: 'batch_a' }]);
    const result = await detectCycle(mockPool, ['batch_b'], 'batch_a');
    expect(result.hasCycle).toBe(true);
    expect(result.reason).toMatch(/Cycle detected/);
    expect(result.reason).toMatch(/batch_a/);
  });

  test('cycle reason message contains the proposed child ID', async () => {
    const mockPool = makePool([{ batch_id: 'grand_parent' }]);
    const result = await detectCycle(mockPool, ['parent_1'], 'grand_parent');
    expect(result.reason).toContain('"grand_parent"');
  });

  // ─── Query construction ───────────────────────────────────────────────────

  test('calls pool.query exactly once', async () => {
    const mockPool = makePool([]);
    await detectCycle(mockPool, ['p1', 'p2'], 'child');
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  test('passes parentBatchIds array as first parameter', async () => {
    const mockPool = makePool([]);
    await detectCycle(mockPool, ['parent_1', 'parent_2'], 'proposed_child');
    const [, params] = mockPool.query.mock.calls[0];
    expect(params[0]).toEqual(['parent_1', 'parent_2']);
  });

  test('passes proposedChildId as second parameter', async () => {
    const mockPool = makePool([]);
    await detectCycle(mockPool, ['p1'], 'proposed_child');
    const [, params] = mockPool.query.mock.calls[0];
    expect(params[1]).toBe('proposed_child');
  });

  test('SQL contains WITH RECURSIVE and the word ancestors', async () => {
    const mockPool = makePool([]);
    await detectCycle(mockPool, ['p1'], 'child');
    const [sql] = mockPool.query.mock.calls[0];
    expect(sql).toMatch(/WITH RECURSIVE/i);
    expect(sql).toMatch(/ancestors/i);
  });

  // ─── Single-parent edge case ──────────────────────────────────────────────

  test('handles a single parent batch correctly', async () => {
    const mockPool = makePool([]);
    const result = await detectCycle(mockPool, ['only_parent'], 'new_child');
    expect(result.hasCycle).toBe(false);
    const [, params] = mockPool.query.mock.calls[0];
    expect(params[0]).toEqual(['only_parent']);
  });

  // ─── Error propagation ────────────────────────────────────────────────────

  test('propagates DB errors', async () => {
    const mockPool = {
      query: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    };
    await expect(detectCycle(mockPool, ['p1'], 'child')).rejects.toThrow('DB connection lost');
  });
});
