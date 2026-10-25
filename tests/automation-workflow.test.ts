import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTOMATION_STAGES} from '../src/automation-workflow';
import {TUNING_CATALOG} from '../src/tuning-catalog';

test('five workshop stages expose every existing catalog slot exactly once with two primary choices', () => {
  assert.equal(AUTOMATION_STAGES.length, 5);
  assert.equal(new Set(AUTOMATION_STAGES.map(stage => stage.id)).size, 5);
  for (const stage of AUTOMATION_STAGES) {
    assert.match(stage.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(stage.name.trim() && stage.shortName.trim());
    assert.equal(stage.primaryKeys.length, 2, `${stage.id}: two primary slots required`);
  }
  const mapped = AUTOMATION_STAGES.flatMap(stage => [...stage.primaryKeys, ...stage.extraKeys]);
  const catalogKeys = TUNING_CATALOG.map(slot => slot.key);
  assert.equal(catalogKeys.length, 23);
  assert.equal(new Set(mapped).size, mapped.length, 'a part must not appear in multiple steps');
  assert.deepEqual([...mapped].sort(), [...catalogKeys].sort(), 'catalog parts must remain reachable');
});
