const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('home-maintenance-manager-card.js', 'utf8');
const context = {
  HTMLElement: class HTMLElement {},
  customElements: { define() {} },
  window: { customCards: [] },
  Date, Map, Set, String, Number, Math, Array, Object,
};
vm.createContext(context);
vm.runInContext(source + '\nglobalThis.CardUnderTest = HomeMaintenanceManagerCard;', context);
const card = new context.CardUnderTest();

test('parses date-only values as local calendar dates', () => {
  const date = card._parseDate('2026-11-12');
  assert.ok(date instanceof Date);
  assert.equal(card._calendarKey(date), '2026-11-12');
});

test('rejects impossible date-only values', () => {
  assert.equal(card._parseDate('2026-02-30'), null);
  assert.equal(card._parseDate('not-a-date'), null);
});

test('formats date-only values without shifting the calendar day', () => {
  const formatted = card._date('2026-11-12');
  assert.match(formatted, /2026/);
  assert.match(formatted, /12/);
});

test('uses integration instance as part of task navigation key', () => {
  assert.equal(card._taskKey({ integration_instance: 'basement', task_id: 'filter' }), 'basement:filter');
  assert.equal(card._taskKey({ integration_instance: 'upstairs', task_id: 'filter' }), 'upstairs:filter');
  assert.notEqual(
    card._taskKey({ integration_instance: 'basement', task_id: 'filter' }),
    card._taskKey({ integration_instance: 'upstairs', task_id: 'filter' })
  );
});

test('calendar and agenda use the shared date-only parser', () => {
  assert.match(source, /const due = this\._parseDate\(value\);/);
  assert.match(source, /const date = this\._parseDate\(value\);/);
});

test('equipment task navigation keys include the integration instance', () => {
  assert.match(source, /data-open-equipment-task-key=/);
  assert.doesNotMatch(source, /data-open-equipment-task-id=/);
  assert.match(source, /this\._taskKey\(attrs, state\.entity_id\) !== this\._equipmentTask/);
  assert.match(source, /state\.attributes\?\.integration_instance \|\| "default"\) === instance/);
});
