/* Home Maintenance Manager Lovelace card
 * Install through HACS Dashboard or use the manual installation instructions in README.md.
 */
class HomeMaintenanceManagerCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      title: "Home Maintenance",
      show_equipment: true,
      show_history: true,
      ...config,
    };
    if (this._filter === undefined) this._filter = "all";
    if (this._category === undefined) this._category = "all";
    if (this._taskSearch === undefined) this._taskSearch = "";
    if (this._selectedEquipmentId === undefined) this._selectedEquipmentId = null;
    if (this._equipmentTask === undefined) this._equipmentTask = null;
    if (this._detailTaskKey === undefined) this._detailTaskKey = null;
    if (this._taskActionForm === undefined) this._taskActionForm = null;
    if (this._view === undefined) this._view = "list";
    if (this._calendarMonth === undefined) this._calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (this._selectedCalendarDate === undefined) this._selectedCalendarDate = this._calendarKey(new Date());
    if (this._historySearch === undefined) this._historySearch = "";
    if (this._historyFrom === undefined) this._historyFrom = "";
    if (this._historyTo === undefined) this._historyTo = "";
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    // Keep native mobile inputs alive while a task action form is being edited.
    // HA state updates can arrive while iOS date/text inputs are opening; rebuilding
    // innerHTML here would detach the focused input and dismiss the keyboard.
    if (this._taskActionForm) return;
    this.render();
  }

  getCardSize() {
    return 5;
  }

  _escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  _parseDate(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const date = match ? new Date(+match[1], +match[2] - 1, +match[3], 12) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    if (match && (date.getFullYear() !== +match[1] || date.getMonth() !== +match[2] - 1 || date.getDate() !== +match[3])) return null;
    return date;
  }

  _taskKey(attrs, fallback = "") {
    return `${attrs?.integration_instance || "default"}:${attrs?.task_id || fallback}`;
  }

  _date(value) {
    if (!value) return "Not scheduled";
    const date = this._parseDate(value);
    if (!date) return "Not scheduled";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  _daysOverdue(value) {
    if (!value) return 0;
    const due = this._parseDate(value);
    if (!due) return 0;
    const today = new Date();
    const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
    const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.floor((todayDay - dueDay) / 86400000));
  }

  _isValidDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  }

  _calendarKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  _renderCalendar(tasks, equipment) {
    const month = new Date(this._calendarMonth.getFullYear(), this._calendarMonth.getMonth(), 1);
    const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
    const dueByDate = new Map();
    tasks.forEach((item) => {
      const value = item.state.attributes?.next_due;
      if (!value) return;
      const due = this._parseDate(value);
      if (!due) return;
      const key = this._calendarKey(due);
      if (!dueByDate.has(key)) dueByDate.set(key, []);
      dueByDate.get(key).push(item);
    });
    const selectedTasks = dueByDate.get(this._selectedCalendarDate) || [];
    const cells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const key = this._calendarKey(date);
      const items = dueByDate.get(key) || [];
      const outside = date.getMonth() !== month.getMonth();
      const selected = key === this._selectedCalendarDate;
      const labels = items.slice(0, 2).map((item) => {
        const name = (item.state.attributes.friendly_name || item.state.entity_id).replace(/ Status$/, "");
        return `<span class="calendar-task">${this._escape(name)}</span>`;
      }).join("");
      const more = items.length > 2 ? `<span class="calendar-more">+${items.length - 2} more</span>` : "";
      return `<button class="calendar-day ${outside ? "outside" : ""} ${selected ? "selected" : ""} ${items.length ? "has-tasks" : ""}" data-calendar-date="${key}">
        <strong>${date.getDate()}</strong>${labels}${more}
      </button>`;
    }).join("");
    const selectedDate = new Date(this._selectedCalendarDate + "T12:00:00");
    const selectedLabel = selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const selectedMarkup = selectedTasks.length
      ? selectedTasks.map((item) => this._renderTask(item, equipment)).join("")
      : '<div class="empty">No maintenance tasks are due on this date.</div>';
    return `<section class="calendar-section">
      <div class="calendar-toolbar">
        <button data-calendar-prev aria-label="Previous month">‹</button>
        <strong>${this._escape(monthLabel)}</strong>
        <button data-calendar-next aria-label="Next month">›</button>
        <button data-calendar-today>Today</button>
      </div>
      <div class="calendar-grid">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}
        ${cells}
      </div>
      <div class="calendar-selected"><h3>${this._escape(selectedLabel)}</h3>${selectedMarkup}</div>
    </section>`;
  }



  _renderInsights(insights) {
    if (!insights?.available) {
      return '<section class="insights-view"><div class="empty">Maintenance insights are not available yet. Update Home Maintenance Manager to v0.12.0 or newer and allow its sensors to refresh.</div></section>';
    }
    const windows = insights.windows || {};
    const categories = Object.entries(insights.categories || {})
      .filter(([, value]) => value.completed > 0)
      .sort((a, b) => b[1].completed - a[1].completed);
    const workload = insights.workload || {};
    const history = (insights.backlog || []).slice(-30);
    const metric = (key) => windows[key] || { completed: 0, completed_late: 0, completed_on_time: 0, late_rate: 0 };
    const completionMarkup = [
      ["30_days", "Last 30 days"],
      ["90_days", "Last 90 days"],
      ["365_days", "Last 365 days"],
    ].map(([key, label]) => {
      const value = metric(key);
      return '<div class="insight-metric"><strong>' + value.completed + '</strong><span>' + label + '</span></div>';
    }).join("");
    const recent = metric("90_days");
    const categoryMax = Math.max(1, ...categories.map(([, value]) => value.completed));
    const categoryMarkup = categories.length
      ? categories.map(([name, value]) => {
          const width = Math.max(0, Math.min(100, value.completed / categoryMax * 100));
          return '<div class="insight-category"><div><span>' + this._escape(name) + '</span><strong>' + value.completed + '</strong></div><div class="insight-track"><span style="width:' + width + '%"></span></div></div>';
        }).join("")
      : '<div class="empty">No completion history has been recorded yet.</div>';
    const maxOverdue = Math.max(1, ...history.map((item) => item.overdue));
    const trendMarkup = history.length
      ? '<div class="insight-trend" role="img" aria-label="Overdue task count over the last ' + history.length + ' recorded days">' +
        history.map((item) => {
          const height = Math.max(3, item.overdue / maxOverdue * 100);
          return '<div class="insight-trend-day" title="' + this._escape(item.date) + ': ' + item.overdue + ' overdue"><span style="height:' + height + '%"></span></div>';
        }).join("") + '</div><div class="insight-trend-labels"><span>' + this._escape(history[0].date) + '</span><span>' + this._escape(history[history.length - 1].date) + '</span></div>'
      : '<div class="empty">The backlog trend will appear after the first daily snapshot is recorded.</div>';
    const count = (key) => Number(workload[key]) || 0;
    return '<section class="insights-view">' +
      '<h3>Completion activity</h3><div class="insight-metrics">' + completionMarkup + '</div>' +
      '<div class="insight-quality"><div><strong>' + recent.completed_on_time + '</strong><span>On time · last 90 days</span></div>' +
      '<div><strong>' + recent.completed_late + '</strong><span>Late · last 90 days</span></div>' +
      '<div><strong>' + recent.late_rate + '%</strong><span>Completed late</span></div></div>' +
      '<h3>Upcoming workload</h3><div class="insight-metrics insight-workload">' +
      '<div class="insight-metric"><strong>' + count("next_7_days") + '</strong><span>Next 7 days</span></div>' +
      '<div class="insight-metric"><strong>' + count("next_30_days") + '</strong><span>Next 30 days</span></div>' +
      '<div class="insight-metric"><strong>' + count("next_90_days") + '</strong><span>Next 90 days</span></div></div>' +
      '<div class="insight-quality"><div><strong>' + count("overdue") + '</strong><span>Overdue</span></div>' +
      '<div><strong>' + count("due_today") + '</strong><span>Due today</span></div>' +
      '<div><strong>' + count("unscheduled") + '</strong><span>Unscheduled</span></div></div>' +
      '<h3>Completions by category</h3><div class="insight-categories">' + categoryMarkup + '</div>' +
      '<h3>Overdue backlog trend</h3><p class="insight-description">Daily snapshots · latest ' + history.length + ' recorded days</p>' +
      trendMarkup + '</section>';
  }

  _renderAgenda(tasks, equipment) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end90 = new Date(today);
    end90.setDate(end90.getDate() + 90);
    const end365 = new Date(today);
    end365.setDate(end365.getDate() + 365);
    const dueDate = (item) => {
      const value = item.state.attributes?.next_due;
      if (!value) return null;
      const date = this._parseDate(value);
      if (!date) return null;
      date.setHours(0, 0, 0, 0);
      return date;
    };
    const sorted = [...tasks].filter((item) => dueDate(item))
      .sort((a, b) => dueDate(a) - dueDate(b));
    const overdue = sorted.filter((item) => item.state.state === "overdue" || dueDate(item) < today);
    const upcoming = sorted.filter((item) => dueDate(item) >= today && dueDate(item) <= end90);
    const seasonal = sorted.filter((item) =>
      item.state.attributes?.schedule_type === "seasonal" &&
      dueDate(item) >= today && dueDate(item) <= end365
    );
    const renderGroup = (items, emptyText) => items.length
      ? items.map((item) => this._renderTask(item, equipment)).join("")
      : '<div class="empty">' + emptyText + '</div>';
    const grouped = new Map();
    upcoming.forEach((item) => {
      const key = this._calendarKey(dueDate(item));
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    const upcomingMarkup = grouped.size
      ? [...grouped.entries()].map(([key, items]) => {
          const date = new Date(key + "T12:00:00");
          const label = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
          return '<div class="agenda-date"><h4>' + this._escape(label) + '</h4>' +
            items.map((item) => this._renderTask(item, equipment)).join("") + '</div>';
        }).join("")
      : '<div class="empty">Nothing is due in the next 90 days.</div>';
    return '<section class="agenda-section">' +
      '<div class="agenda-overview"><div><strong>' + overdue.length + '</strong><span>Overdue</span></div>' +
      '<div><strong>' + upcoming.length + '</strong><span>Due in 90 days</span></div>' +
      '<div><strong>' + seasonal.length + '</strong><span>Seasonal this year</span></div></div>' +
      '<div class="agenda-group"><h3>Overdue maintenance</h3>' +
      renderGroup(overdue, "You are all caught up. No overdue maintenance.") + '</div>' +
      '<div class="agenda-group"><h3>Upcoming · next 90 days</h3>' + upcomingMarkup + '</div>' +
      '<div class="agenda-group"><h3>Seasonal maintenance · next 12 months</h3>' +
      renderGroup(seasonal, "No seasonal tasks are currently scheduled in the next 12 months.") + '</div>' +
      '</section>';
  }

  _renderHistory(tasks, equipment) {
    const records = [];
    tasks.forEach(({ state }) => {
      const attrs = state.attributes || {};
      (attrs.completion_history || []).forEach((record) => {
        const names = (record.equipment_ids || []).map((id) => equipment.find((entry) =>
          entry.attributes.equipment_id === id &&
          (entry.attributes.integration_instance || "default") === (attrs.integration_instance || "default")
        )).filter(Boolean).map((entry) => entry.attributes.friendly_name || entry.state);
        records.push({...record,
          integration_instance: attrs.integration_instance || "default",
          task_id: attrs.task_id,
          task_name: record.task_name || (attrs.friendly_name || state.entity_id).replace(/ Status$/, ""),
          equipment_names: names});
      });
    });
    const unique = [...new Map(records.map((record) => [
      `${record.integration_instance}:${record.history_id || `${record.task_id}:${record.completed_at}`}`,
      record,
    ])).values()]
      .sort((a,b) => new Date(b.completed_at) - new Date(a.completed_at));
    const filtered = unique.filter((record) => {
      const haystack = [record.task_name, record.task_id, record.notes, ...(record.equipment_names || [])].join(" ").toLowerCase();
      if (this._historySearch && !haystack.includes(this._historySearch.toLowerCase())) return false;
      const day = (record.completed_at || "").slice(0,10);
      return (!this._historyFrom || day >= this._historyFrom) && (!this._historyTo || day <= this._historyTo);
    });
    const rows = filtered.length ? filtered.map((record) => `
      <article class="history-record">
        <div class="history-record-heading"><strong>${this._escape(record.task_name)}</strong><span>${this._escape(this._date(record.completed_at))}</span></div>
        <div class="history-property" title="Integration instance: ${this._escape(record.integration_instance)}">Property · ${this._escape(record.integration_instance)}</div>
        ${record.equipment_names?.length ? `<div class="history-meta">Equipment: ${this._escape(record.equipment_names.join(", "))}</div>` : ""}
        ${record.notes ? `<p>${this._escape(record.notes)}</p>` : ""}
      </article>`).join("") : '<div class="empty">No completion records match these filters.</div>';
    return `<section class="history-view">
      <div class="history-controls">
        <input type="search" data-history-search placeholder="Search task, equipment, or notes" value="${this._escape(this._historySearch)}">
        <label>From <input type="date" data-history-from value="${this._escape(this._historyFrom)}"></label>
        <label>To <input type="date" data-history-to value="${this._escape(this._historyTo)}"></label>
        <button data-history-clear>Clear filters</button>
      </div>
      <div class="history-result-count">Showing ${filtered.length} of ${unique.length} recent completion records</div>
      <div class="history-records">${rows}</div>
      <p class="history-note">The card displays recent completion records available from task sensors. Use Export history for the complete permanent archive.</p>
    </section>`;
  }

  _renderScheduleHistory(tasks) {
    const records = [];
    tasks.forEach(({ state }) => {
      const attrs = state.attributes || {};
      (attrs.schedule_history || []).forEach((record, index) => {
        records.push({
          ...record,
          integration_instance: attrs.integration_instance || "default",
          task_id: attrs.task_id,
          task_name: (attrs.friendly_name || state.entity_id).replace(/ Status$/, ""),
          record_key: `${attrs.integration_instance || "default"}:${record.history_id || `${attrs.task_id}:${record.adjusted_at || record.next_due || index}`}`,
        });
      });
    });
    const unique = [...new Map(records.map((record) => [record.record_key, record])).values()]
      .sort((a, b) => new Date(b.adjusted_at) - new Date(a.adjusted_at));
    const filtered = unique.filter((record) => {
      const haystack = [
        record.task_name, record.task_id, record.reason, record.change_type,
        record.previous_schedule?.schedule_type, record.new_schedule?.schedule_type,
      ].join(" ").toLowerCase();
      if (this._historySearch && !haystack.includes(this._historySearch.toLowerCase())) return false;
      const day = (record.adjusted_at || "").slice(0, 10);
      return (!this._historyFrom || day >= this._historyFrom) && (!this._historyTo || day <= this._historyTo);
    });
    const scheduleLabel = (schedule) => {
      if (!schedule) return "Not recorded";
      const type = schedule.schedule_type || "interval";
      if (type === "annual") {
        const month = Number(schedule.annual_month);
        const day = Number(schedule.annual_day);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `Annual · ${new Date(2000, month - 1, day).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
        }
        return "Annual schedule";
      }
      if (type === "monthly") {
        const weeks = { first: "First", second: "Second", third: "Third", fourth: "Fourth", last: "Last" };
        const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const week = weeks[schedule.monthly_week];
        const weekday = weekdays[Number(schedule.monthly_weekday)];
        return week && weekday ? `Monthly · ${week} ${weekday}` : "Monthly weekday schedule";
      }
      if (type === "seasonal") return "Seasonal schedule";
      const interval = Number(schedule.interval_days);
      return interval > 0 ? `Every ${interval} days` : "Interval schedule";
    };
    const rows = filtered.length ? filtered.map((record) => {
      const configuration = record.change_type === "configuration" || record.previous_schedule || record.new_schedule;
      return `<article class="history-record schedule-history-record">
        <div class="history-record-heading"><strong>${this._escape(record.task_name)}</strong><span>${this._escape(this._date(record.adjusted_at))}</span></div>
        <div class="history-property" title="Integration instance: ${this._escape(record.integration_instance)}">Property · ${this._escape(record.integration_instance)}</div>
        <div class="schedule-change-kind">${configuration ? "Schedule configuration changed" : "Due date rescheduled"}</div>
        ${configuration ? `<div class="schedule-comparison"><div><span>Previous schedule</span><strong>${this._escape(scheduleLabel(record.previous_schedule))}</strong></div><div><span>New schedule</span><strong>${this._escape(scheduleLabel(record.new_schedule))}</strong></div></div>` : ""}
        <div class="schedule-due-comparison"><span>Due date: ${this._escape(this._date(record.previous_due))} → ${this._escape(this._date(record.next_due))}</span></div>
        ${record.reason ? `<p>${this._escape(record.reason)}</p>` : ""}
      </article>`;
    }).join("") : '<div class="empty">No schedule changes match these filters.</div>';
    return `<section class="history-view">
      <div class="history-controls">
        <input type="search" data-history-search placeholder="Search task or change reason" value="${this._escape(this._historySearch)}">
        <label>From <input type="date" data-history-from value="${this._escape(this._historyFrom)}"></label>
        <label>To <input type="date" data-history-to value="${this._escape(this._historyTo)}"></label>
        <button data-history-clear>Clear filters</button>
      </div>
      <div class="history-result-count">Showing ${filtered.length} of ${unique.length} schedule changes</div>
      <div class="history-records">${rows}</div>
      <p class="history-note">Schedule changes are shown separately from permanent completion history.</p>
    </section>`;
  }


  _renderEquipmentView(equipment, tasks) {
    if (!equipment.length) {
      return '<section class="equipment-view"><div class="empty">No equipment records found. Add equipment in Home Maintenance Manager → Configure → Add household equipment.</div></section>';
    }
    const records = equipment.map((entry) => {
      const attrs = entry.attributes || {};
      const instance = attrs.integration_instance || "default";
      const ids = Array.isArray(attrs.task_ids) ? attrs.task_ids : [];
      const linked = tasks.filter(({ state }) =>
        ids.includes(state.attributes?.task_id) &&
        (state.attributes?.integration_instance || "default") === instance
      );
      const overdue = linked.filter(({ state }) => state.state === "overdue").length;
      const dueSoon = linked.filter(({ state }) => ["due_today", "due_soon"].includes(state.state)).length;
      const metadata = [attrs.manufacturer, attrs.model].filter(Boolean).join(" · ");
      const lifecycle = [];
      if (attrs.category) lifecycle.push(attrs.category);
      if (attrs.installed_date) lifecycle.push("Installed " + this._date(attrs.installed_date));
      if (Number(attrs.lifespan_months) > 0) lifecycle.push("Expected lifespan " + attrs.lifespan_months + " months");
      if (attrs.replacement_due) lifecycle.push("Replacement due " + this._date(attrs.replacement_due));
      const replacement = attrs.replacement_task_id
        ? linked.find(({ state }) => state.attributes?.task_id === attrs.replacement_task_id)
        : null;
      const taskMarkup = linked.length
        ? linked.map((item) => `<div class="equipment-linked-task">${this._renderTask(item, equipment)}<button class="equipment-task-open" data-open-equipment-task-key="${this._escape(this._taskKey(item.state.attributes, item.state.entity_id))}">Open in task list</button></div>`).join("")
        : '<div class="empty equipment-empty">No active maintenance tasks are linked to this equipment.</div>';
      return `
        <article class="equipment-card ${this._selectedEquipmentId === `${instance}:${attrs.equipment_id}` ? "selected" : ""}" data-equipment-card="${this._escape(`${instance}:${attrs.equipment_id}`)}">
          <div class="equipment-card-header">
            <div><h3>${this._escape(attrs.friendly_name || entry.state)}</h3>
              ${metadata ? '<div class="equipment-meta">' + this._escape(metadata) + '</div>' : ''}
              <div class="equipment-lifecycle">${this._escape(lifecycle.join(" · ") || "Equipment record")}</div>
            </div>
            <div class="equipment-counts">
              <span>${linked.length} linked</span>
              ${overdue ? '<span class="equipment-overdue">' + overdue + ' overdue</span>' : ''}
              ${dueSoon ? '<span>' + dueSoon + ' due soon</span>' : ''}
            </div>
          </div>
          ${replacement ? '<div class="equipment-replacement">Replacement task: ' + this._escape((replacement.state.attributes.friendly_name || replacement.state.entity_id).replace(/ Status$/, '')) + '</div>' : ''}
          <div class="equipment-linked-tasks">${taskMarkup}</div>
        </article>`;
    }).join("");
    const totalLinked = equipment.reduce((sum, entry) => {
      const attrs = entry.attributes || {};
      const instance = attrs.integration_instance || "default";
      const ids = Array.isArray(attrs.task_ids) ? attrs.task_ids : [];
      return sum + tasks.filter(({ state }) =>
        ids.includes(state.attributes?.task_id) &&
        (state.attributes?.integration_instance || "default") === instance
      ).length;
    }, 0);
    const overdueTotal = equipment.reduce((sum, entry) => {
      const attrs = entry.attributes || {};
      const instance = attrs.integration_instance || "default";
      const ids = Array.isArray(attrs.task_ids) ? attrs.task_ids : [];
      return sum + tasks.filter(({ state }) =>
        ids.includes(state.attributes?.task_id) &&
        (state.attributes?.integration_instance || "default") === instance &&
        state.state === "overdue"
      ).length;
    }, 0);
    return `<section class="equipment-view">
      <div class="equipment-overview">
        <div><strong>${equipment.length}</strong><span>Equipment items</span></div>
        <div><strong>${totalLinked}</strong><span>Linked tasks</span></div>
        <div><strong>${overdueTotal}</strong><span>Overdue tasks</span></div>
      </div>
      ${records}
    </section>`;
  }

  _renderAreasView(tasks, equipment) {
    const groups = new Map();
    const ensure = (id, name) => {
      const key = id || "unassigned";
      if (!groups.has(key)) groups.set(key, {
        id, name: id ? (name || "Area") : "Unassigned",
        equipment: [], tasks: new Map(),
      });
      const group = groups.get(key);
      if (id && name && group.name === "Area") group.name = name;
      return group;
    };
    equipment.forEach((entry) => {
      const attrs = entry.attributes || {};
      const areaId = attrs.area_id || null;
      ensure(areaId, attrs.area_name).equipment.push(entry);
    });
    tasks.forEach((item) => {
      const attrs = item.state.attributes || {};
      const ids = Array.isArray(attrs.area_ids) ? attrs.area_ids : [];
      const names = Array.isArray(attrs.area_names) ? attrs.area_names : [];
      if (!ids.length) {
        ensure(null, null).tasks.set(
          `${attrs.integration_instance || "default"}:${attrs.task_id || item.state.entity_id}`, item
        );
        return;
      }
      ids.forEach((id, index) => {
        ensure(id, names[index]).tasks.set(
          `${attrs.integration_instance || "default"}:${attrs.task_id || item.state.entity_id}`, item
        );
      });
    });
    if (!groups.size) {
      return '<section class="areas-view"><div class="empty">No areas, equipment, or maintenance tasks are available yet.</div></section>';
    }
    const ordered = [...groups.values()].sort((a, b) =>
      a.name === "Unassigned" ? 1 : b.name === "Unassigned" ? -1 : a.name.localeCompare(b.name)
    );
    const cards = ordered.map((group) => {
      const linkedTasks = [...group.tasks.values()];
      const overdue = linkedTasks.filter(({ state }) => state.state === "overdue").length;
      const dueToday = linkedTasks.filter(({ state }) => state.state === "due_today").length;
      const upcoming = linkedTasks.filter(({ state }) => state.state === "due_soon").length;
      const equipmentMarkup = group.equipment.length
        ? `<div class="area-equipment"><h4>Equipment · ${group.equipment.length}</h4><div>${group.equipment.map((entry) => {
          const attrs = entry.attributes || {};
          return `<span class="area-equipment-item">${this._escape(attrs.friendly_name || entry.state)}</span>`;
        }).join("")}</div></div>`
        : "";
      const taskMarkup = linkedTasks.length
        ? linkedTasks.map((item) => `<div class="area-task">${this._renderTask(item, equipment)}</div>`).join("")
        : '<div class="empty area-empty">No maintenance tasks assigned to this area.</div>';
      return `<article class="area-card">
        <div class="area-card-heading"><div><h3>${this._escape(group.name)}</h3><span>${group.equipment.length} equipment · ${linkedTasks.length} tasks</span></div>
          <div class="area-status">
            <span>${overdue} overdue</span><span>${dueToday} due today</span><span>${upcoming} upcoming</span>
          </div>
        </div>
        ${equipmentMarkup}
        <div class="area-tasks"><h4>Maintenance tasks</h4>${taskMarkup}</div>
      </article>`;
    }).join("");
    const totals = ordered.reduce((result, group) => {
      result.equipment += group.equipment.length;
      result.areaTaskAssignments += group.tasks.size;
      result.overdue += [...group.tasks.values()].filter(({ state }) => state.state === "overdue").length;
      return result;
    }, { equipment: 0, areaTaskAssignments: 0, overdue: 0 });
    return `<section class="areas-view">
      <div class="areas-overview">
        <div><strong>${ordered.filter((group) => group.id).length}</strong><span>Areas</span></div>
        <div><strong>${totals.equipment}</strong><span>Equipment</span></div>
        <div><strong>${totals.overdue}</strong><span>Overdue assignments</span></div>
      </div>
      <p class="areas-note">Tasks linked to equipment appear in each area containing linked equipment. Unlinked tasks can be assigned an area in the integration settings.</p>
      ${cards}
    </section>`;
  }

  _discover() {
    const states = Object.values(this._hass?.states || {});
    const integrationStates = states.filter((state) =>
      state.attributes?.integration_domain === "home_maintenance_manager"
    );
    const historySensors = integrationStates.filter((state) =>
      state.entity_id.startsWith("sensor.") && state.attributes?.task_id
    );
    const taskSensors = historySensors.filter((state) =>
      state.attributes?.enabled !== false
    );
    const buttons = new Map(integrationStates
      .filter((state) => state.entity_id.startsWith("button.") && state.attributes?.task_id)
      .map((state) => [
        `${state.attributes.integration_instance || "default"}:${state.attributes.task_id}`,
        state.entity_id,
      ]));
    const summaryTotals = new Map();
    integrationStates
      .filter((state) => state.entity_id.startsWith("sensor.") && state.attributes?.summary_key)
      .forEach((state) => {
        const key = state.attributes.summary_key;
        const value = Number(state.state);
        if (!Number.isFinite(value)) return;
        summaryTotals.set(key, (summaryTotals.get(key) || 0) + value);
      });
    const equipment = integrationStates.filter((state) =>
      state.entity_id.startsWith("sensor.") && state.attributes?.equipment_id
    );

    // Insight attributes are repeated across several sensors for each
    // integration entry. Read one copy per instance, then combine instances.
    const insightByInstance = new Map();
    integrationStates
      .filter((state) => state.entity_id.startsWith("sensor."))
      .forEach((state) => {
        const attrs = state.attributes || {};
        const instance = attrs.integration_instance || "default";
        if (!insightByInstance.has(instance)) insightByInstance.set(instance, {});
        const target = insightByInstance.get(instance);
        if (!target.completion && attrs.completion_windows) {
          target.completion = { windows: attrs.completion_windows, categories: attrs.completion_by_category || {} };
        }
        if (!target.workload && attrs.upcoming_workload) target.workload = attrs.upcoming_workload;
        if (!target.backlog && Array.isArray(attrs.overdue_backlog_history)) {
          target.backlog = attrs.overdue_backlog_history;
        }
      });
    const insights = {
      available: false,
      windows: {},
      categories: {},
      workload: {},
      backlog: [],
    };
    for (const data of insightByInstance.values()) {
      if (data.completion) {
        insights.available = true;
        for (const [window, values] of Object.entries(data.completion.windows || {})) {
          const bucket = insights.windows[window] ||= { completed: 0, completed_late: 0, completed_on_time: 0 };
          bucket.completed += Number(values.completed) || 0;
          bucket.completed_late += Number(values.completed_late) || 0;
          bucket.completed_on_time += Number(values.completed_on_time) || 0;
        }
        for (const [category, values] of Object.entries(data.completion.categories || {})) {
          const bucket = insights.categories[category] ||= { completed: 0, completed_late: 0, completed_on_time: 0 };
          bucket.completed += Number(values.completed) || 0;
          bucket.completed_late += Number(values.completed_late) || 0;
          bucket.completed_on_time += Number(values.completed_on_time) || 0;
        }
      }
      if (data.workload) {
        insights.available = true;
        for (const [key, value] of Object.entries(data.workload)) {
          insights.workload[key] = (insights.workload[key] || 0) + (Number(value) || 0);
        }
      }
      if (data.backlog) {
        insights.available = true;
        data.backlog.forEach((snapshot) => {
          if (!snapshot?.date) return;
          const bucket = insights.backlog.find((item) => item.date === snapshot.date);
          if (bucket) bucket.overdue += Number(snapshot.overdue) || 0;
          else insights.backlog.push({ date: snapshot.date, overdue: Number(snapshot.overdue) || 0 });
        });
      }
    }
    Object.values(insights.windows).forEach((bucket) => {
      bucket.late_rate = bucket.completed ? Math.round(bucket.completed_late / bucket.completed * 1000) / 10 : 0;
    });
    Object.values(insights.categories).forEach((bucket) => {
      bucket.completed_on_time = Math.max(0, bucket.completed - bucket.completed_late);
    });
    insights.backlog.sort((a, b) => a.date.localeCompare(b.date));

    return {
      insights,
      tasks: taskSensors.map((state) => ({
        state,
        button: buttons.get(
          `${state.attributes.integration_instance || "default"}:${state.attributes.task_id}`
        ),
      })).sort((a, b) => {
        const order = { overdue: 0, due_today: 1, due_soon: 2, scheduled: 3, not_scheduled: 4 };
        return (order[a.state.state] ?? 5) - (order[b.state.state] ?? 5) ||
          (a.state.attributes.friendly_name || "").localeCompare(b.state.attributes.friendly_name || "");
      }),
      summaries: summaryTotals,
      historyTasks: historySensors.map((state) => ({ state })),
      equipment,
    };
  }

  _statusLabel(status) {
    return ({
      overdue: "Overdue",
      due_today: "Due today",
      due_soon: "Due soon",
      scheduled: "Scheduled",
      not_scheduled: "Not scheduled",
      disabled: "Disabled",
    })[status] || status;
  }

  _scheduleDescription(attrs) {
    const type = attrs.schedule_type || "interval";
    if (type === "annual") {
      const month = Number(attrs.annual_month);
      const day = Number(attrs.annual_day);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(2000, month - 1, day);
        return `Annual · ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
      }
      return "Annual schedule";
    }
    if (type === "monthly") {
      const weeks = { first: "First", second: "Second", third: "Third", fourth: "Fourth", last: "Last" };
      const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const week = weeks[attrs.monthly_week];
      const weekday = weekdays[Number(attrs.monthly_weekday)];
      return week && weekday ? `Monthly · ${week} ${weekday}` : "Monthly weekday schedule";
    }
    if (type === "seasonal") {
      const seasons = Array.isArray(attrs.season_keys) ? attrs.season_keys.join(", ") : "";
      return seasons ? `Seasonal · ${seasons}` : "Seasonal schedule";
    }
    const interval = Number(attrs.configured_interval_days || attrs.recommended_interval_days);
    return interval > 0 ? `Every ${interval} days` : "Interval schedule";
  }

  _buildTaskActionRequest(form) {
    const actionType = form.dataset.action;
    const payload = {
      task_id: form.dataset.taskId,
      integration_instance: form.dataset.instance || "default",
    };
    if (actionType === "reschedule") {
      const dueDate = form.querySelector('[name="due_date"]').value;
      if (!this._isValidDateKey(dueDate)) return null;
      payload.due_date = dueDate;
      payload.reason = form.querySelector('[name="reason"]').value.trim();
    } else {
      payload.notes = form.querySelector('[name="notes"]').value.trim();
    }
    return {
      service: actionType === "reschedule" ? "reschedule_task" : "complete_task",
      payload,
    };
  }

  _renderTask(item, equipment) {
    const state = item.state;
    const attrs = state.attributes || {};
    const name = (attrs.friendly_name || state.entity_id).replace(/ Status$/, "");
    const status = state.state;
    const daysOverdue = status === "overdue" ? this._daysOverdue(attrs.next_due) : 0;
    const statusText = daysOverdue > 0
      ? `Overdue · ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"}`
      : this._statusLabel(status);
    const key = `${attrs.integration_instance || "default"}:${attrs.task_id}`;
    const action = item.button
      ? `<div class="task-action-buttons"><button class="reschedule" data-open-task-action="reschedule" data-task-key="${this._escape(key)}" data-task-id="${this._escape(attrs.task_id)}" data-instance="${this._escape(attrs.integration_instance || "default")}" data-current-due="${this._escape((attrs.next_due || "").slice(0, 10))}">Reschedule</button><button class="complete" data-open-task-action="complete" data-task-key="${this._escape(key)}" data-task-id="${this._escape(attrs.task_id)}" data-instance="${this._escape(attrs.integration_instance || "default")}">Mark complete</button></div>`
      : '<span class="muted">No completion button</span>';
    const actionForm = this._taskActionForm?.key === key
      ? this._renderTaskActionForm(key, attrs)
      : "";
    const details = this._detailTaskKey === key ? this._renderTaskDetails(item, equipment) : "";
    const detailLabel = this._detailTaskKey === key ? "Hide details" : "Details";
    return `
      <article class="task">
        <div class="task-main">
          <div class="task-name">${this._escape(name)}</div>
          <div class="meta">${this._escape(attrs.category || "General")} · Due: ${this._escape(this._date(attrs.next_due))} · ${this._escape(this._scheduleDescription(attrs))}</div>
          ${attrs.description ? `<div class="description">${this._escape(attrs.description)}</div>` : ""}
          <button class="details-toggle" data-details="${this._escape(key)}">${detailLabel}</button>
          ${details}
          ${actionForm}
        </div>
        <div class="task-actions">
          <span class="status ${this._escape(status)}">${this._escape(statusText)}</span>
          ${action}
        </div>
      </article>`;
  }

  _renderTaskActionForm(key, attrs) {
    const form = this._taskActionForm;
    const name = (attrs.friendly_name || attrs.task_id || "this task").replace(/ Status$/, "");
    if (form.type === "reschedule") {
      return `<form class="task-inline-form" data-task-action-form data-action="reschedule" data-task-key="${this._escape(key)}" data-task-id="${this._escape(attrs.task_id)}" data-instance="${this._escape(attrs.integration_instance || "default")}">
        <strong>Reschedule ${this._escape(name)}</strong>
        <label>New due date<input type="date" name="due_date" required value="${this._escape(form.date || (attrs.next_due || "").slice(0, 10))}"></label>
        <label>Reason (optional)<input type="text" name="reason" maxlength="500" placeholder="Why is this being rescheduled?"></label>
        <div class="task-inline-form-actions"><button type="button" data-cancel-task-action>Cancel</button><button type="submit" class="complete">Save due date</button></div>
      </form>`;
    }
    return `<form class="task-inline-form" data-task-action-form data-action="complete" data-task-key="${this._escape(key)}" data-task-id="${this._escape(attrs.task_id)}" data-instance="${this._escape(attrs.integration_instance || "default")}">
      <strong>Complete ${this._escape(name)}</strong>
      <label>Completion notes (optional)<textarea name="notes" rows="2" maxlength="2000" placeholder="Add any details about this maintenance..."></textarea></label>
      <div class="task-inline-form-actions"><button type="button" data-cancel-task-action>Cancel</button><button type="submit" class="complete">Confirm completion</button></div>
    </form>`;
  }

  _renderTaskDetails(item, equipment) {
    const attrs = item.state.attributes || {};
    const linkedEquipment = equipment.filter((entry) =>
      (attrs.equipment_ids || []).includes(entry.attributes.equipment_id) &&
      (entry.attributes.integration_instance || "default") === (attrs.integration_instance || "default")
    );
    const equipmentMarkup = linkedEquipment.length
      ? linkedEquipment.map((entry) => `<button class="equipment-task" data-equipment-id="${this._escape(`${entry.attributes.integration_instance || "default"}:${entry.attributes.equipment_id}`)}">${this._escape(entry.attributes.friendly_name || entry.state)}</button>`).join("")
      : "None linked";
    const history = [...(attrs.completion_history || [])].reverse();
    const scheduleHistory = [...(attrs.schedule_history || [])].reverse();
    const scheduleMarkup = scheduleHistory.length ? `<div class="schedule-history"><strong>Recent schedule changes</strong>${scheduleHistory.slice(0, 5).map((record) => `<div class="history-item"><span>${this._escape(this._date(record.adjusted_at))}: ${this._escape(this._date(record.previous_due))} → ${this._escape(this._date(record.next_due))}</span>${record.reason ? `<span>${this._escape(record.reason)}</span>` : ""}</div>`).join("")}</div>` : "";
    const historyMarkup = history.length ? history.slice(0, 5).map((record) => `
      <div class="history-item">
        <strong>${this._escape(this._date(record.completed_at))}</strong>
        <span>Previous due: ${this._escape(this._date(record.previous_due))}</span>
        ${record.notes ? `<div class="description">${this._escape(record.notes)}</div>` : ""}
      </div>`).join("") : '<div class="muted">No completion history yet.</div>';
    const interval = attrs.configured_interval_days
      ? `${this._escape(attrs.configured_interval_days)} days`
      : (attrs.schedule_type === "seasonal" ? `Seasonal (${this._escape((attrs.season_keys || []).join(", "))})` : "Not set");
    const guideList = (value) => {
      const items = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
      const clean = items.map((entry) => String(entry).trim()).filter(Boolean);
      return clean.length ? "<ul>" + clean.map((entry) => "<li>" + this._escape(entry) + "</li>").join("") + "</ul>" : "";
    };
    const guideMarkup = [
      ["How to inspect", guideList(attrs.how_to_inspect)],
      ["What to look for", guideList(attrs.what_to_look_for)],
      ["What to do if something is wrong", attrs.what_to_do_if_issue ? "<p>" + this._escape(attrs.what_to_do_if_issue) + "</p>" : ""],
      ["Safety precautions", attrs.safety_notes ? "<p>" + this._escape(attrs.safety_notes) + "</p>" : ""],
    ].filter(([, body]) => body).map(([heading, body]) =>
      "<section class=\"inspection-guide-section\"><strong>" + heading + "</strong>" + body + "</section>"
    ).join("");
    return `<div class="task-details">
      ${guideMarkup ? `<div class="inspection-guide"><strong class="inspection-guide-title">Inspection guide</strong>${guideMarkup}</div>` : ""}
      <div><span>Last completed</span><strong>${this._escape(this._date(attrs.last_completed))}</strong></div>
      <div><span>Next due</span><strong>${this._escape(this._date(attrs.next_due))}</strong></div>
      <div><span>Repeat interval</span><strong>${interval}</strong></div>
      <div><span>Linked equipment</span><div>${equipmentMarkup}</div></div>
      <div class="history-list"><strong>Recent completions</strong>${historyMarkup}</div>
      ${scheduleMarkup}
    </div>`;
  }

  render() {
    if (!this._hass || !this.config) return;
    const { tasks, summaries, historyTasks, equipment, insights } = this._discover();
    const count = (key) => summaries.get(key) ?? "—";
    const categories = [...new Set(tasks.map(({ state }) => state.attributes.category || "General"))].sort();
    const filtered = tasks.filter(({ state }) => {
      const attrs = state.attributes || {};
      const category = attrs.category || "General";
      if (this._category !== "all" && category !== this._category) return false;
      if (this._equipmentTask && this._taskKey(attrs, state.entity_id) !== this._equipmentTask) return false;
      if (this._taskSearch.trim()) {
        const linkedEquipment = equipment.filter((entry) =>
          (attrs.equipment_ids || []).includes(entry.attributes?.equipment_id) &&
          (entry.attributes?.integration_instance || "default") === (attrs.integration_instance || "default")
        );
        const haystack = [attrs.friendly_name, attrs.task_id, category, attrs.description,
          ...linkedEquipment.flatMap((entry) => [entry.attributes?.friendly_name, entry.attributes?.manufacturer, entry.attributes?.model])]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(this._taskSearch.trim().toLowerCase())) return false;
      }
      if (this._filter === "all") return true;
      if (this._filter === "upcoming") return ["due_today", "due_soon"].includes(state.state);
      return state.state === this._filter;
    });
    const categoryMarkup = '<div class="task-search"><input type="search" data-task-search placeholder="Search tasks, categories, or equipment" value="' + this._escape(this._taskSearch) + '" aria-label="Search maintenance tasks"></div><div class="category-filters"><button data-category="all" class="' + (this._category === "all" ? "selected" : "") + '">All categories</button>' + categories.map((category) => '<button data-category="' + this._escape(category) + '" class="' + (this._category === category ? "selected" : "") + '">' + this._escape(category) + '</button>').join("") + '</div>';
    const taskMarkup = filtered.length
      ? filtered.map((item) => this._renderTask(item, equipment)).join("")
      : '<div class="empty">No tasks match this filter.</div>';
    const calendarMarkup = this._renderCalendar(tasks, equipment);
    const historyMarkup = this._renderHistory(historyTasks, equipment);
    const equipmentMarkup = equipment.length
      ? equipment.map((item) => {
        const attrs = item.attributes || {};
        const instance = attrs.integration_instance || "default";
        const ids = Array.isArray(attrs.task_ids) ? attrs.task_ids : [];
        const linked = tasks.filter(({ state }) => ids.includes(state.attributes?.task_id) &&
          (state.attributes?.integration_instance || "default") === instance);
        const links = linked.length ? linked.map(({ state }) => '<button class="equipment-task" data-open-equipment-task-key="' + this._escape(this._taskKey(state.attributes, state.entity_id)) + '">' + this._escape((state.attributes.friendly_name || state.entity_id).replace(/ Status$/, "")) + '</button>').join("") : '<span class="muted">No linked tasks</span>';
        const metadata = [attrs.manufacturer, attrs.model].filter(Boolean).join(" ");
        const lifecycle = [];
        if (attrs.installed_date) lifecycle.push("Installed " + this._escape(this._date(attrs.installed_date)));
        if (Number(attrs.lifespan_months) > 0) lifecycle.push("Expected lifespan " + this._escape(attrs.lifespan_months) + " months");
        if (attrs.replacement_due) lifecycle.push("Replacement due " + this._escape(this._date(attrs.replacement_due)));
        return '<div class="equipment"><div class="equipment-main"><strong>' + this._escape(attrs.friendly_name || item.state) + '</strong><div class="equipment-meta">' + this._escape(metadata) + '</div>' + (lifecycle.length ? '<div class="equipment-lifecycle">' + lifecycle.join(" · ") + '</div>' : '') + '<div class="equipment-links">' + links + '</div></div></div>';
      }).join("")
      : '<div class="muted">No equipment records found.</div>';
    this.innerHTML = `
      <ha-card>
        <div class="header"><div class="title">${this._escape(this.config.title)}</div><div class="subtitle">Home maintenance at a glance</div></div>
        <div class="stats">
          <div class="stat"><strong>${this._escape(count("total"))}</strong><span>Active tasks</span></div>
          <div class="stat warning"><strong>${this._escape(count("overdue"))}</strong><span>Overdue</span></div>
          <div class="stat"><strong>${this._escape(count("due_today"))}</strong><span>Due today</span></div>
          <div class="stat"><strong>${this._escape(count("due_soon"))}</strong><span>Due soon</span></div>
        </div>
        <div class="view-toggle"><button data-view="list" class="${this._view === "list" ? "selected" : ""}">List view</button><button data-view="calendar" class="${this._view === "calendar" ? "selected" : ""}">Calendar</button><button data-view="agenda" class="${this._view === "agenda" ? "selected" : ""}">Schedule agenda</button><button data-view="insights" class="${this._view === "insights" ? "selected" : ""}">Insights</button><button data-view="areas" class="${this._view === "areas" ? "selected" : ""}">Areas</button><button data-view="equipment" class="${this._view === "equipment" ? "selected" : ""}">Equipment</button><button data-view="history" class="${this._view === "history" ? "selected" : ""}">Completions</button><button data-view="schedule-history" class="${this._view === "schedule-history" ? "selected" : ""}">Schedule changes</button></div>
        <div class="maintenance-tools">
          <label>History export
            <select data-export-format>
              <option value="both" ${(this._exportFormat || "both") === "both" ? "selected" : ""}>CSV + JSON</option>
              <option value="csv" ${this._exportFormat === "csv" ? "selected" : ""}>CSV</option>
              <option value="json" ${this._exportFormat === "json" ? "selected" : ""}>JSON</option>
            </select>
          </label>
          <button data-export-history>Export history</button>
          <button data-create-backup>Create JSON backup</button>
        </div>
        <div class="filters" style="${this._view !== "list" ? "display:none" : ""}">
          <button data-filter="all" class="${this._filter === "all" ? "selected" : ""}">All</button>
          <button data-filter="overdue" class="${this._filter === "overdue" ? "selected" : ""}">Overdue</button>
          <button data-filter="due_today" class="${this._filter === "due_today" ? "selected" : ""}">Due today</button>
          <button data-filter="upcoming" class="${this._filter === "upcoming" ? "selected" : ""}">Upcoming</button>
        </div>
        ${this._view === "calendar" ? calendarMarkup : this._view === "agenda" ? this._renderAgenda(tasks, equipment) : this._view === "insights" ? this._renderInsights(insights) : this._view === "areas" ? this._renderAreasView(tasks, equipment) : this._view === "equipment" ? this._renderEquipmentView(equipment, tasks) : this._view === "history" ? historyMarkup : this._view === "schedule-history" ? this._renderScheduleHistory(historyTasks) : categoryMarkup}
        ${this._equipmentTask ? '<div class="active-filter">Showing selected equipment task <button data-clear-task>Clear</button></div>' : ""}
        ${this._view === "list" ? `<div class="task-result-count">Showing ${filtered.length} of ${tasks.length} tasks</div>` : ""}
        ${this._view === "list" ? `<div class="tasks">${taskMarkup}</div>` : ""}
        ${this.config.show_equipment && this._view !== "equipment" ? `<section><h3>Equipment <small>${this._escape(count("equipment_count"))} registered</small></h3>${equipmentMarkup}</section>` : ""}
        ${this.config.show_history ? `<footer>Completion history records: <strong>${this._escape(count("history_count"))}</strong></footer>` : ""}
      </ha-card>
      <style>
        ha-card{overflow:hidden}.header{padding:18px 18px 10px}.title{font-size:1.35rem;font-weight:600}.subtitle,.meta,.muted{color:var(--secondary-text-color);font-size:.86rem}
        .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:8px 16px 14px}
        .stat{background:var(--secondary-background-color);border-radius:10px;padding:10px 6px;text-align:center;display:flex;flex-direction:column;gap:3px}
        .stat strong{font-size:1.35rem}.stat span{font-size:.75rem;color:var(--secondary-text-color)}.warning strong{color:var(--error-color)}
        .view-toggle{display:flex;gap:7px;padding:0 16px 12px}.view-toggle button,.calendar-toolbar button{border:0;border-radius:16px;padding:7px 12px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}.view-toggle button.selected{background:var(--primary-color);color:var(--text-primary-color,#fff)}
        .insights-view{padding:8px 16px 16px}.insights-view h3{margin-top:18px}.insight-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.insight-metric,.insight-quality>div{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;padding:12px 6px;border-radius:9px;background:var(--secondary-background-color);text-align:center}.insight-metric strong,.insight-quality strong{font-size:1.35rem;font-weight:650}.insight-metric span,.insight-quality span{font-size:.72rem;color:var(--secondary-text-color)}.insight-quality{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}.insight-category{margin:10px 0}.insight-category>div:first-child{display:flex;justify-content:space-between;gap:8px;font-size:.82rem;margin-bottom:5px}.insight-track{height:7px;border-radius:8px;background:var(--secondary-background-color);overflow:hidden}.insight-track span{display:block;height:100%;border-radius:8px;background:var(--primary-color)}.insight-description{font-size:.76rem;color:var(--secondary-text-color);margin:0 0 8px}.insight-trend{height:116px;display:flex;align-items:flex-end;gap:3px;padding:8px 0 0;border-bottom:1px solid var(--divider-color)}.insight-trend-day{height:100%;flex:1;min-width:2px;display:flex;align-items:flex-end}.insight-trend-day span{display:block;width:100%;min-height:3px;border-radius:3px 3px 0 0;background:var(--primary-color)}.insight-trend-labels{display:flex;justify-content:space-between;font-size:.7rem;color:var(--secondary-text-color);margin-top:5px}.agenda-section{padding:8px 16px 16px}.agenda-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:4px 0 14px}.agenda-overview>div{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 5px;border-radius:9px;background:var(--secondary-background-color)}.agenda-overview strong{font-size:1.25rem}.agenda-overview span{font-size:.72rem;color:var(--secondary-text-color);text-align:center}.agenda-group{margin-top:12px}.agenda-group h3{margin:8px 0}.agenda-date h4{font-size:.88rem;margin:12px 0 2px;color:var(--primary-text-color)}.calendar-section{padding:8px 12px 14px}.calendar-toolbar{display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 0 12px}.calendar-toolbar strong{min-width:150px;text-align:center}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.calendar-weekday{text-align:center;font-size:.72rem;color:var(--secondary-text-color);padding:5px 0}.calendar-day{min-width:0;min-height:74px;padding:4px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--primary-text-color);text-align:left;display:flex;flex-direction:column;gap:3px;cursor:pointer}.calendar-day>strong{font-size:.8rem}.calendar-day.outside{opacity:.42}.calendar-day.selected{outline:2px solid var(--primary-color);background:var(--secondary-background-color)}.calendar-day.has-tasks>strong{color:var(--primary-color)}.calendar-task,.calendar-more{font-size:.62rem;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:3px;background:var(--secondary-background-color);padding:2px}.calendar-more{color:var(--secondary-text-color)}.calendar-selected{padding-top:10px}.calendar-selected h3{margin-bottom:6px}
        .filters{display:flex;gap:6px;padding:0 16px 12px;flex-wrap:wrap}.filters button,.complete{border:0;border-radius:18px;padding:7px 11px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}
        .filters button.selected,.category-filters button.selected{background:var(--primary-color);color:var(--text-primary-color,#fff)}
         .task-search{padding:0 16px 10px}.task-search input{box-sizing:border-box;width:100%;border:1px solid var(--divider-color);border-radius:8px;padding:10px 12px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}.task-result-count{padding:0 16px 8px;font-size:.76rem;color:var(--secondary-text-color)}.category-filters{display:flex;gap:6px;padding:0 16px 10px;flex-wrap:wrap}.category-filters button,.equipment-task,.active-filter button{border:0;border-radius:16px;padding:6px 10px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer;font:inherit;font-size:.8rem}.equipment-task,.active-filter button{background:none;color:var(--primary-color);text-decoration:underline;padding:3px 5px}.active-filter{padding:0 16px 10px;font-size:.82rem;color:var(--secondary-text-color)}
        .tasks{padding:0 16px}.task{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--divider-color)}
        .task-main{min-width:0}.task-name{font-weight:600}.meta{margin-top:3px}.description{font-size:.82rem;margin-top:5px;color:var(--secondary-text-color)}
        .details-toggle{border:0;background:none;color:var(--primary-color);padding:6px 0 0;cursor:pointer;font:inherit;font-size:.8rem}.task-details{margin-top:10px;padding:10px;border-radius:8px;background:var(--secondary-background-color);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;font-size:.82rem}.task-details>div:not(.history-list){display:flex;flex-direction:column;gap:3px}.task-details span{color:var(--secondary-text-color)}.inspection-guide{grid-column:1/-1;border-bottom:1px solid var(--divider-color);padding-bottom:10px}.inspection-guide-title{display:block;font-size:.9rem;margin-bottom:8px}.inspection-guide-section{display:block!important;margin-top:8px;padding:0;border:0}.inspection-guide-section strong{display:block;color:var(--primary-text-color);margin-bottom:3px}.inspection-guide-section ul{margin:3px 0 0;padding-left:20px}.inspection-guide-section li{margin:3px 0}.inspection-guide-section p{margin:3px 0;color:var(--secondary-text-color)}.history-list{grid-column:1/-1;border-top:1px solid var(--divider-color);padding-top:8px}.history-item{display:flex;flex-direction:column;gap:2px;padding:7px 0;border-top:1px solid var(--divider-color)}
        .maintenance-tools{display:flex;align-items:end;gap:8px;flex-wrap:wrap;padding:0 16px 12px}.maintenance-tools label{display:flex;flex-direction:column;gap:4px;font-size:.75rem;color:var(--secondary-text-color)}.maintenance-tools select,.maintenance-tools button{border:1px solid var(--divider-color);border-radius:16px;padding:7px 10px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:.8rem}.maintenance-tools button{cursor:pointer}.maintenance-tools button:hover{border-color:var(--primary-color)}
        .history-view{padding:10px 16px 16px}.history-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end}.history-controls>input,.history-controls label input{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--divider-color);border-radius:7px;padding:9px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}.history-controls>input{grid-column:1/-1}.history-controls label{font-size:.78rem;color:var(--secondary-text-color)}.history-controls label input{display:block;margin-top:3px}.history-controls button{justify-self:start;border:0;background:var(--secondary-background-color);color:var(--primary-text-color);border-radius:16px;padding:7px 12px;cursor:pointer}.history-result-count{font-size:.8rem;color:var(--secondary-text-color);padding:12px 0 4px}.history-record{border-top:1px solid var(--divider-color);padding:11px 0;font-size:.85rem}.history-property{font-size:.74rem;color:var(--secondary-text-color);margin-top:3px;overflow-wrap:anywhere}.history-record-heading{display:flex;justify-content:space-between;gap:8px}.history-record-heading span,.history-meta{color:var(--secondary-text-color);font-size:.8rem}.history-record p{margin:6px 0}.history-note{font-size:.75rem;color:var(--secondary-text-color);margin-top:12px}.schedule-change-kind{font-size:.78rem;color:var(--primary-color);margin-top:5px}.schedule-comparison{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.schedule-comparison>div{display:flex;flex-direction:column;gap:3px;padding:8px;border-radius:7px;background:var(--secondary-background-color)}.schedule-comparison span,.schedule-due-comparison{font-size:.75rem;color:var(--secondary-text-color)}.schedule-comparison strong{font-size:.84rem;color:var(--primary-text-color)}.schedule-due-comparison{margin-top:7px}
        .task-inline-form{display:flex;flex-direction:column;gap:9px;width:min(100%,300px);box-sizing:border-box;padding:10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--secondary-background-color);font-size:.82rem;position:relative;z-index:1;pointer-events:auto}.task-inline-form label{display:flex;flex-direction:column;gap:4px;color:var(--secondary-text-color)}.task-inline-form input,.task-inline-form textarea{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid var(--divider-color);border-radius:6px;padding:10px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit;position:relative;z-index:2;pointer-events:auto;touch-action:manipulation}.task-inline-form textarea{resize:vertical}.task-inline-form-actions{display:flex;justify-content:flex-end;gap:7px}.task-inline-form-actions button{border:1px solid var(--divider-color);border-radius:16px;padding:7px 11px;background:var(--card-background-color);color:var(--primary-text-color);cursor:pointer;font:inherit}.task-inline-form-actions button.complete{background:var(--success-color,var(--primary-color));color:var(--text-primary-color,#fff);border-color:transparent}.task-inline-form button:disabled{opacity:.55;cursor:wait}
        .task-actions{display:flex;align-items:flex-end;gap:7px;flex-direction:column;flex-shrink:0}.status{font-size:.75rem;font-weight:600;border-radius:12px;padding:3px 8px;background:var(--secondary-background-color)}
        .status.overdue{color:var(--error-color)}.status.due_today{color:var(--warning-color)}.status.due_soon{color:var(--primary-color)}
        .task-action-buttons{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.reschedule{border:1px solid var(--divider-color);border-radius:18px;padding:7px 10px;background:var(--card-background-color);color:var(--primary-color);font-size:.78rem;cursor:pointer}.complete{background:var(--success-color,var(--primary-color));color:var(--text-primary-color,#fff);font-size:.78rem}
        section{padding:8px 16px 14px;border-top:1px solid var(--divider-color)}h3{font-size:1rem;margin:8px 0}h3 small{font-weight:400;color:var(--secondary-text-color);margin-left:5px}
        .areas-view{padding:8px 16px 16px}.areas-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:4px 0 12px}.areas-overview>div{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 5px;border-radius:9px;background:var(--secondary-background-color)}.areas-overview strong{font-size:1.25rem}.areas-overview span,.areas-note,.area-card-heading>div>span{font-size:.75rem;color:var(--secondary-text-color)}.areas-note{line-height:1.45;margin:0 0 12px}.area-card{border:1px solid var(--divider-color);border-radius:10px;padding:12px;margin:10px 0}.area-card-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.area-card-heading h3{margin:0 0 3px}.area-status{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.area-status span{font-size:.68rem;border-radius:12px;padding:4px 7px;background:var(--secondary-background-color);white-space:nowrap}.area-equipment,.area-tasks{margin-top:12px}.area-equipment h4,.area-tasks h4{font-size:.82rem;margin:0 0 6px}.area-equipment>div{display:flex;gap:6px;flex-wrap:wrap}.area-equipment-item{font-size:.76rem;padding:5px 8px;border-radius:7px;background:var(--secondary-background-color)}.area-task{border-top:1px solid var(--divider-color)}.area-empty{font-size:.8rem;padding:8px 0}.areas-view .task{padding:10px 0}.view-toggle{flex-wrap:wrap}.equipment-view{padding:8px 16px 16px}.equipment-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:4px 0 14px}.equipment-overview>div{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 5px;border-radius:9px;background:var(--secondary-background-color)}.equipment-overview strong{font-size:1.25rem}.equipment-overview span{font-size:.72rem;color:var(--secondary-text-color);text-align:center} .equipment-card{border:1px solid var(--divider-color);border-radius:10px;padding:12px;margin:10px 0}.equipment-card.selected{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color)}.equipment-linked-task{border-top:1px solid var(--divider-color);padding-top:5px;margin-top:5px}.equipment-task-open{border:0;background:none;color:var(--primary-color);padding:4px 0;cursor:pointer;font:inherit;font-size:.78rem;text-decoration:underline}.equipment-card-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.equipment-card-header h3{margin:0 0 3px}.equipment-counts{display:flex;flex-direction:column;align-items:flex-end;gap:4px;white-space:nowrap;font-size:.75rem;color:var(--secondary-text-color)}.equipment-overdue{color:var(--error-color);font-weight:600}.equipment-replacement{font-size:.8rem;margin-top:8px;color:var(--secondary-text-color)}.equipment-linked-tasks{margin-top:6px}.equipment-empty{padding:8px 0}.equipment{display:flex;justify-content:space-between;gap:12px;padding:9px 0;font-size:.88rem;border-bottom:1px solid var(--divider-color)}.equipment-main{min-width:0;width:100%}.equipment-meta,.equipment-lifecycle{font-size:.76rem;color:var(--secondary-text-color);margin-top:3px}.equipment-links{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
        footer{border-top:1px solid var(--divider-color);padding:12px 16px;color:var(--secondary-text-color);font-size:.85rem}.empty{padding:16px 0;color:var(--secondary-text-color)}
        @media(max-width:600px){
          .header{padding:14px 14px 8px}.stats{grid-template-columns:repeat(2,minmax(0,1fr));padding:8px 12px 12px}
          .view-toggle{padding:0 12px 10px;flex-wrap:wrap}.filters,.category-filters{padding-left:12px;padding-right:12px}
          .tasks{padding:0 12px}.task{align-items:stretch;flex-direction:column;gap:9px;padding:12px 0}
          .task-main{width:100%}.task-actions{width:100%;align-items:center;flex-direction:row;justify-content:space-between;flex-wrap:wrap;gap:8px}
          .task-action-buttons{justify-content:flex-start;flex:1 1 100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
          .task-action-buttons button,.task-inline-form-actions button{min-height:40px}
          .task-inline-form{width:100%;max-width:none}.task-inline-form-actions{display:grid;grid-template-columns:1fr 1fr}
          .task-details{grid-template-columns:minmax(0,1fr);gap:10px;padding:12px}.task-details>div,.task-details>div:not(.history-list){min-width:0}
          .history-view,.equipment-view,.agenda-section,.areas-view{padding-left:12px;padding-right:12px}.area-card-heading{flex-direction:column}.area-status{justify-content:flex-start}
          .history-controls{grid-template-columns:minmax(0,1fr)}.history-controls>input{grid-column:auto}
          .schedule-comparison{grid-template-columns:minmax(0,1fr)}
          .equipment-card-header{flex-direction:column}.equipment-counts{align-items:flex-start;flex-direction:row;flex-wrap:wrap;white-space:normal}
          .equipment{flex-direction:column;gap:2px}.equipment span{text-align:left}
          .calendar-day{min-height:58px;padding:3px}.calendar-task,.calendar-more{font-size:.55rem}
          .calendar-toolbar{gap:6px;flex-wrap:wrap}.calendar-toolbar strong{min-width:0;flex:1 1 100%;order:-1}
        }
        @media(max-width:360px){
          .agenda-overview,.equipment-overview,.areas-overview{grid-template-columns:minmax(0,1fr)}
          .task-action-buttons{grid-template-columns:minmax(0,1fr)}
          .history-record-heading{flex-direction:column;gap:3px}
          .calendar-day{min-height:48px}.calendar-weekday{font-size:.65rem}
        }
      </style>`;
    this.querySelectorAll("[data-export-format]").forEach((select) => select.addEventListener("change", () => {
      this._exportFormat = select.value;
    }));
    this.querySelectorAll("[data-export-history]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await this._hass.callService("home_maintenance_manager", "export_history", {
          format: this._exportFormat || "both",
        });
      } catch (error) {
        window.alert("Could not export maintenance history. Check Home Assistant logs for details.");
      } finally {
        button.disabled = false;
      }
    }));
    this.querySelectorAll("[data-create-backup]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await this._hass.callService("home_maintenance_manager", "create_backup", {});
      } catch (error) {
        window.alert("Could not create a maintenance backup. Check Home Assistant logs for details.");
      } finally {
        button.disabled = false;
      }
    }));
    this.querySelectorAll("[data-history-search]").forEach((input) => input.addEventListener("input", () => {
      this._historySearch = input.value;
      const position = input.selectionStart;
      this.render();
      const refreshed = this.querySelector("[data-history-search]");
      if (refreshed) { refreshed.focus(); refreshed.setSelectionRange(position, position); }
    }));
    this.querySelectorAll("[data-history-from]").forEach((input) => input.addEventListener("change", () => {
      this._historyFrom = input.value; this.render();
    }));
    this.querySelectorAll("[data-history-to]").forEach((input) => input.addEventListener("change", () => {
      this._historyTo = input.value; this.render();
    }));
    this.querySelectorAll("[data-history-clear]").forEach((button) => button.addEventListener("click", () => {
      this._historySearch = ""; this._historyFrom = ""; this._historyTo = ""; this.render();
    }));
    this.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      this._view = button.dataset.view;
      this.render();
    }));
    this.querySelectorAll("[data-calendar-prev]").forEach((button) => button.addEventListener("click", () => {
      this._calendarMonth = new Date(this._calendarMonth.getFullYear(), this._calendarMonth.getMonth() - 1, 1);
      this.render();
    }));
    this.querySelectorAll("[data-calendar-next]").forEach((button) => button.addEventListener("click", () => {
      this._calendarMonth = new Date(this._calendarMonth.getFullYear(), this._calendarMonth.getMonth() + 1, 1);
      this.render();
    }));
    this.querySelectorAll("[data-calendar-today]").forEach((button) => button.addEventListener("click", () => {
      const today = new Date();
      this._calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      this._selectedCalendarDate = this._calendarKey(today);
      this.render();
    }));
    this.querySelectorAll("[data-calendar-date]").forEach((button) => button.addEventListener("click", () => {
      this._selectedCalendarDate = button.dataset.calendarDate;
      this.render();
    }));
    this.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      this._filter = button.dataset.filter;
      this.render();
    }));
    this.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
      this._category = button.dataset.category;
      this.render();
    }));
    this.querySelectorAll("[data-task-search]").forEach((input) => input.addEventListener("input", () => {
      this._taskSearch = input.value;
      const position = input.selectionStart;
      this.render();
      const refreshed = this.querySelector("[data-task-search]");
      if (refreshed) { refreshed.focus(); refreshed.setSelectionRange(position, position); }
    }));
    this.querySelectorAll("[data-equipment-id]").forEach((button) => button.addEventListener("click", () => {
      this._selectedEquipmentId = button.dataset.equipmentId;
      this._view = "equipment";
      this.render();
      this.querySelectorAll("[data-equipment-card]").forEach((card) => {
        if (card.dataset.equipmentCard === this._selectedEquipmentId) card.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }));
    this.querySelectorAll("[data-details]").forEach((button) => button.addEventListener("click", () => {
      this._detailTaskKey = this._detailTaskKey === button.dataset.details ? null : button.dataset.details;
      this.render();
    }));
    this.querySelectorAll("[data-open-equipment-task-key]").forEach((button) => button.addEventListener("click", () => {
      this._equipmentTask = button.dataset.openEquipmentTaskKey;
      this._category = "all";
      this._filter = "all";
      this._taskSearch = "";
      this._view = "list";
      this.render();
    }));
    this.querySelectorAll("[data-clear-task]").forEach((button) => button.addEventListener("click", () => {
      this._equipmentTask = null;
      this.render();
    }));
    this.querySelectorAll("[data-open-task-action]").forEach((button) => button.addEventListener("click", () => {
      this._taskActionForm = {
        type: button.dataset.openTaskAction,
        key: button.dataset.taskKey,
        date: button.dataset.currentDue || "",
      };
      this.render();
    }));
    this.querySelectorAll("[data-cancel-task-action]").forEach((button) => button.addEventListener("click", () => {
      this._taskActionForm = null;
      this.render();
    }));
    this.querySelectorAll("[data-task-action-form]").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const actionType = form.dataset.action;
      const request = this._buildTaskActionRequest(form);
      if (!request) {
        window.alert("Enter a valid due date.");
        return;
      }
      submit.disabled = true;
      try {
        await this._hass.callService(
          "home_maintenance_manager",
          request.service,
          request.payload
        );
        this._taskActionForm = null;
        this.render();
      } catch (error) {
        window.alert(actionType === "reschedule"
          ? "Could not reschedule this task. Check Home Assistant logs for details."
          : "Could not complete this task. Check Home Assistant logs for details.");
        submit.disabled = false;
      }
    }));
  }
}
customElements.define("home-maintenance-manager-card", HomeMaintenanceManagerCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "home-maintenance-manager-card",
  name: "Home Maintenance Manager",
  description: "Maintenance overview with task status and completion actions.",
});
