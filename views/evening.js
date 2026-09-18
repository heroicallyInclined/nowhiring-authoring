// The Evening (plans/authoring-tool-task8.md Task 8.8): guest schedule,
// patience, the arrival curve, and interrupts, read together -- the
// plainest view in the set, with no cross-table join beyond what the
// schemas already declare. Read-only, matching the Pantry/Menu/Board/Inn
// precedent -- this task's own Changes never asked for an edit affordance.

const GUEST_KINDS = ["locals", "heroes", "travelers"];
const RATE_FIELDS = ["base", "reputation_coefficient", "spread"];

// Exported alongside `build` so tools/prove-evening.mjs can check the same
// logic against the real sibling data without a DOM.
export function formatDayRange(from_day, to_day) {
  return from_day === to_day ? `Day ${from_day}` : `Days ${from_day}–${to_day}`;
}

export function formatPercent(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

function buildLabeledLine(label, text) {
  const p = document.createElement("p");
  p.className = "evening-line";
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  p.appendChild(strong);
  p.appendChild(document.createTextNode(text));
  return p;
}

function buildTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function buildBar(fraction) {
  const bar = document.createElement("div");
  bar.className = "evening-bar";
  const fill = document.createElement("span");
  fill.className = "evening-bar-fill";
  fill.style.width = `${Math.min(fraction, 1) * 100}%`;
  bar.appendChild(fill);
  return bar;
}

function buildScheduleTable(guestScheduleData) {
  const table = document.createElement("table");
  table.className = "evening-table";

  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  for (const kind of GUEST_KINDS) {
    for (const field of RATE_FIELDS) {
      const th = document.createElement("th");
      th.textContent = `${kind}: ${field.replace("reputation_coefficient", "rep. coef.")}`;
      headRow.appendChild(th);
    }
  }
  const thead = document.createElement("thead");
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const entry of guestScheduleData.entries) {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = formatDayRange(entry.from_day, entry.to_day);
    row.appendChild(th);
    for (const kind of GUEST_KINDS) {
      for (const field of RATE_FIELDS) {
        const td = document.createElement("td");
        td.textContent = String(entry[kind][field]);
        row.appendChild(td);
      }
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  return table;
}

function buildPatienceTable(guestScheduleData, patienceOrder) {
  const table = document.createElement("table");
  table.className = "evening-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const kind of patienceOrder) {
    const th = document.createElement("th");
    th.textContent = kind;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const row = document.createElement("tr");
  for (const kind of patienceOrder) {
    const td = document.createElement("td");
    td.textContent = String(guestScheduleData.patience[kind]);
    row.appendChild(td);
  }
  tbody.appendChild(row);
  table.appendChild(tbody);

  return table;
}

function buildArrivalSection(arrival) {
  const section = document.createElement("section");
  section.className = "evening-section";

  const heading = document.createElement("h3");
  heading.textContent = "Arrival";
  section.appendChild(heading);

  section.appendChild(buildLabeledLine("Seat to capacity on open", String(arrival.seat_to_capacity_on_open)));
  section.appendChild(buildLabeledLine("Span fraction", formatPercent(arrival.span_fraction)));
  section.appendChild(buildBar(arrival.span_fraction));
  section.appendChild(buildLabeledLine("Minimum spacing", `${arrival.min_spacing} notch(es)`));

  return section;
}

function buildInterruptsSection(interruptsData) {
  const section = document.createElement("section");
  section.className = "evening-section";

  const heading = document.createElement("h3");
  heading.textContent = "Interrupts";
  section.appendChild(heading);

  const perDayTable = document.createElement("table");
  perDayTable.className = "evening-table";
  const perDayHead = document.createElement("tr");
  for (const label of ["", "Count"]) {
    const th = document.createElement("th");
    th.textContent = label;
    perDayHead.appendChild(th);
  }
  const perDayThead = document.createElement("thead");
  perDayThead.appendChild(perDayHead);
  perDayTable.appendChild(perDayThead);

  const perDayBody = document.createElement("tbody");
  for (const entry of interruptsData.per_day) {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = formatDayRange(entry.from_day, entry.to_day);
    row.appendChild(th);
    const td = document.createElement("td");
    td.textContent = String(entry.count);
    row.appendChild(td);
    perDayBody.appendChild(row);
  }
  perDayTable.appendChild(perDayBody);
  section.appendChild(perDayTable);

  section.appendChild(buildLabeledLine("First notch", String(interruptsData.schedule.first_notch)));
  section.appendChild(buildLabeledLine("Last fraction", formatPercent(interruptsData.schedule.last_fraction)));

  const maxWeight = Math.max(...interruptsData.types.map((t) => t.weight));
  const typesTable = document.createElement("table");
  typesTable.className = "evening-table";
  const typesBody = document.createElement("tbody");
  for (const type of interruptsData.types) {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = type.id;
    row.appendChild(th);
    const weightCell = document.createElement("td");
    weightCell.textContent = String(type.weight);
    row.appendChild(weightCell);
    const barCell = document.createElement("td");
    barCell.appendChild(buildBar(type.weight / maxWeight));
    row.appendChild(barCell);
    typesBody.appendChild(row);
  }
  typesTable.appendChild(typesBody);
  section.appendChild(typesTable);

  section.appendChild(buildLabeledLine("Defer stays chance", formatPercent(interruptsData.defer_stays_chance)));

  const tellerLabel = document.createElement("p");
  tellerLabel.className = "evening-line";
  const tellerStrong = document.createElement("strong");
  tellerStrong.textContent = "Quiet word tellers:";
  tellerLabel.appendChild(tellerStrong);
  section.appendChild(tellerLabel);

  const tellerKinds = document.createElement("div");
  tellerKinds.className = "tags";
  for (const kind of interruptsData.quiet_word_teller_kinds) tellerKinds.appendChild(buildTag(kind));
  section.appendChild(tellerKinds);

  return section;
}

export function build(ctx) {
  const guestScheduleData = ctx.tables.get("guest_schedule");
  const interruptsData = ctx.tables.get("interrupts");
  const patienceOrder = ctx.schemas.get("guest_schedule").fields.patience.key.values;

  const root = document.createElement("div");
  root.className = "evening-view";

  const scheduleSection = document.createElement("section");
  scheduleSection.className = "evening-section";
  const scheduleHeading = document.createElement("h3");
  scheduleHeading.textContent = "Guest schedule";
  scheduleSection.appendChild(scheduleHeading);
  scheduleSection.appendChild(buildScheduleTable(guestScheduleData));
  root.appendChild(scheduleSection);

  const patienceSection = document.createElement("section");
  patienceSection.className = "evening-section";
  const patienceHeading = document.createElement("h3");
  patienceHeading.textContent = "Patience";
  patienceSection.appendChild(patienceHeading);
  patienceSection.appendChild(buildPatienceTable(guestScheduleData, patienceOrder));
  patienceSection.appendChild(buildLabeledLine("Tip patience", String(guestScheduleData.tip_patience)));
  root.appendChild(patienceSection);

  root.appendChild(buildArrivalSection(guestScheduleData.arrival));
  root.appendChild(buildInterruptsSection(interruptsData));

  return root;
}
