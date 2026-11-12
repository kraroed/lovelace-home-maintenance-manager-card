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
test('renders equipment with linked tasks without referencing attributes before initialization', () => {
  const equipmentCard = new context.CardUnderTest();
  const taskState = {
    entity_id: 'sensor.filter_status',
    state: 'due_soon',
    attributes: {
      task_id: 'filter',
      integration_instance: 'basement',
      friendly_name: 'Basement filter',
      category: 'HVAC',
    },
  };
  equipmentCard.config = { title: 'Test', show_equipment: true, show_history: false };
  equipmentCard._hass = { states: {}, callService: async () => {} };
  equipmentCard._view = 'equipment';
  equipmentCard._discover = () => ({
    tasks: [{ state: taskState }],
    summaries: new Map(),
    historyTasks: [],
    equipment: [{
      state: 'Basement furnace',
      attributes: {
        equipment_id: 'furnace',
        integration_instance: 'basement',
        task_ids: ['filter'],
        friendly_name: 'Basement furnace',
        manufacturer: 'Example',
      },
    }],
    insights: {},
  });
  equipmentCard._renderCalendar = () => '';
  equipmentCard._renderHistory = () => '';
  equipmentCard._renderEquipmentView = () => '<section>Equipment view</section>';
  equipmentCard._renderTask = () => '<div>Basement filter task</div>';
  let equipmentViewArgs;
  equipmentCard._renderEquipmentView = (equipment, tasks) => {
    equipmentViewArgs = { equipment, tasks };
    return '<section>Equipment view</section>';
  };
  equipmentCard.querySelectorAll = () => [];

  assert.doesNotThrow(() => equipmentCard.render());
  assert.equal(equipmentViewArgs.equipment.length, 1);
  assert.equal(equipmentViewArgs.tasks.length, 1);
  assert.equal(equipmentViewArgs.equipment[0].attributes.equipment_id, 'furnace');
  assert.equal(equipmentViewArgs.tasks[0].state, taskState);
});


test('completion history deduplication is scoped to each integration instance', () => {
  const historyCard = new context.CardUnderTest();
  historyCard._historySearch = '';
  historyCard._historyFrom = '';
  historyCard._historyTo = '';
  historyCard._escape = (value) => String(value ?? '');
  historyCard._date = (value) => String(value ?? '');
  const completedAt = '2026-11-12T12:00:00+00:00';
  const sharedRecord = {
    history_id: 'clean_gutters:2026-11-12T12:00:00+00:00',
    completed_at: completedAt,
    notes: '',
  };
  const tasks = ['property-one', 'property-two'].map((instance) => ({
    state: {
      entity_id: `sensor.${instance}_gutters_status`,
      attributes: {
        task_id: 'clean_gutters',
        integration_instance: instance,
        friendly_name: 'Clean gutters Status',
        completion_history: [{ ...sharedRecord }],
      },
    },
  }));

  const html = historyCard._renderHistory(tasks, []);
  assert.match(html, /Showing 2 of 2 recent completion records/);
});

test('schedule history deduplication is scoped to each integration instance', () => {
  const historyCard = new context.CardUnderTest();
  historyCard._historySearch = '';
  historyCard._historyFrom = '';
  historyCard._historyTo = '';
  historyCard._escape = (value) => String(value ?? '');
  historyCard._date = (value) => String(value ?? '');
  const adjustedAt = '2026-11-12T12:00:00+00:00';
  const tasks = ['property-one', 'property-two'].map((instance) => ({
    state: {
      entity_id: `sensor.${instance}_gutters_status`,
      attributes: {
        task_id: 'clean_gutters',
        integration_instance: instance,
        friendly_name: 'Clean gutters Status',
        schedule_history: [{
          adjusted_at: adjustedAt,
          previous_due: '2026-11-01',
          next_due: '2026-12-01',
          reason: 'Moved date',
        }],
      },
    },
  }));

  const html = historyCard._renderScheduleHistory(tasks);
  assert.match(html, /Showing 2 of 2 schedule changes/);
});
