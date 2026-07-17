import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  guardAction,
  nextState,
  type ConnectionState,
} from '../src/infrastructure/security/ConnectionState.js';

test('ConnectionState: CONNECTING 拦截 ACTION', () => {
  assert.deepEqual(guardAction('CONNECTING', 'ACTION'), { code: 'NOT_AUTHORIZED', message: '连接尚未认证，请先加入或重连' });
  assert.deepEqual(guardAction('CONNECTING', 'START'), { code: 'NOT_AUTHORIZED', message: '连接尚未认证，请先加入或重连' });
});

test('ConnectionState: AUTHORIZING 也拦截 ACTION', () => {
  assert.deepEqual(guardAction('AUTHORIZING', 'ACTION'), { code: 'NOT_AUTHORIZED', message: '认证进行中，请稍候' });
});

test('ConnectionState: JOIN/RECONNECT 在任何状态都放行', () => {
  for (const s of ['CONNECTING', 'AUTHORIZING', 'CONNECTED'] as ConnectionState[]) {
    assert.equal(guardAction(s, 'JOIN'), null);
    assert.equal(guardAction(s, 'RECONNECT'), null);
  }
});

test('ConnectionState: CONNECTED 全部放行', () => {
  assert.equal(guardAction('CONNECTED', 'ACTION'), null);
  assert.equal(guardAction('CONNECTED', 'START'), null);
});

test('ConnectionState: nextState 推进 AUTHORIZING→CONNECTED', () => {
  assert.equal(nextState('CONNECTING', 'JOIN', true), 'CONNECTED');
  assert.equal(nextState('CONNECTING', 'JOIN', false), 'AUTHORIZING');
  assert.equal(nextState('AUTHORIZING', 'RECONNECT', true), 'CONNECTED');
});
