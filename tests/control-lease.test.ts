import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlLease } from '../native/control-lease.mjs';
test('only deliberate interaction can take controls from another tab or a legacy client', () => {
  const lease=new ControlLease();assert.equal(lease.accept(undefined,false,0),true);
  assert.equal(lease.accept('new-tab-123',false,10),false);
  assert.equal(lease.accept('new-tab-123',true,20),true);
  assert.equal(lease.accept(undefined,false,30),false);
  assert.equal(lease.accept('other-tab-456',false,40),false);
  assert.equal(lease.accept('other-tab-456',true,50),true);
  assert.equal(lease.accept('new-tab-123',false,60),false);
});
test('an expired owner cannot resume held controls without a new interaction', () => {
  const lease=new ControlLease();lease.accept('new-tab-123',true,0);
  assert.equal(lease.accept('new-tab-123',false,2100),false);
  assert.equal(lease.accept('new-tab-123',true,2200),true);
});
