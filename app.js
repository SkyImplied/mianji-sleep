(function () {
  "use strict";

  var STORAGE_KEY = "mianji_sleep_records_v1";
  var PROFILE_KEY = "mianji_profile_v1";
  var POOP_KEY = "mianji_poop_records_v1";
  var CALCIUM_KEY = "mianji_calcium_records_v1";
  var GOAL_MINUTES = 7 * 60;
  var MAX_CHART_MINUTES = 10 * 60;
  var state = {
    records: loadRecords(),
    poopRecords: loadPoopRecords(),
    calciumRecords: loadCalciumRecords(),
    profileName: loadProfileName(),
    bedtimeGoal: loadBedtimeGoal(),
    period: 7,
    activeView: "today",
    calendarMetric: "sleep",
    calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  };

  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };

  function loadProfileName() {
    try {
      var saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return String(saved.name || "薯条脆脆").trim().slice(0, 12) || "薯条脆脆";
    } catch (error) {
      return "薯条脆脆";
    }
  }

  function loadBedtimeGoal() {
    try {
      var saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return /^\d{2}:\d{2}$/.test(saved.bedtimeGoal || "") ? saved.bedtimeGoal : "22:00";
    } catch (error) {
      return "22:00";
    }
  }

  function loadPoopRecords() {
    try {
      var raw = JSON.parse(localStorage.getItem(POOP_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(function (r) { return r && r.date && r.time; }) : [];
    } catch (error) {
      return [];
    }
  }

  function loadCalciumRecords() {
    try {
      var raw = JSON.parse(localStorage.getItem(CALCIUM_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(function (r) { return r && r.date && r.time && Number(r.dose) > 0; }) : [];
    } catch (error) {
      return [];
    }
  }

  function saveProfileName() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: state.profileName, bedtimeGoal: state.bedtimeGoal }));
  }

  function localDateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function parseDateKey(key) {
    var parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function shiftDate(date, amount) {
    var next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function loadRecords() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(isValidRecord).sort(function (a, b) { return b.date.localeCompare(a.date); });
    } catch (error) {
      return [];
    }
  }

  function isValidRecord(record) {
    return record && /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
      /^\d{2}:\d{2}$/.test(record.bedtime) && /^\d{2}:\d{2}$/.test(record.waketime);
  }

  function saveRecords() {
    state.records.sort(function (a, b) { return b.date.localeCompare(a.date); });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  }

  function saveWellnessRecords() {
    state.poopRecords.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    state.calciumRecords.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    localStorage.setItem(POOP_KEY, JSON.stringify(state.poopRecords));
    localStorage.setItem(CALCIUM_KEY, JSON.stringify(state.calciumRecords));
  }

  function timeToMinutes(value) {
    var parts = value.split(":").map(Number);
    return parts[0] * 60 + parts[1];
  }

  function sleepMinutes(record) {
    var bed = timeToMinutes(record.bedtime);
    var wake = timeToMinutes(record.waketime);
    if (wake <= bed) wake += 24 * 60;
    return wake - bed;
  }

  function nightMinutes(value) {
    var minutes = timeToMinutes(value);
    return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
  }

  function isSleepOnTime(record) {
    return nightMinutes(record.bedtime) <= nightMinutes(state.bedtimeGoal);
  }

  function durationParts(minutes) {
    return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
  }

  function compactDuration(minutes) {
    var part = durationParts(minutes);
    return part.hours + "h " + String(part.minutes).padStart(2, "0") + "m";
  }

  function chineseDuration(minutes) {
    var part = durationParts(minutes);
    return part.hours + " 小时 " + String(part.minutes).padStart(2, "0") + " 分";
  }

  function recordsWithin(days) {
    var today = new Date();
    var start = shiftDate(today, -(days - 1));
    var startKey = localDateKey(start);
    var todayKey = localDateKey(today);
    return state.records.filter(function (r) { return r.date >= startKey && r.date <= todayKey; });
  }

  function average(numbers) {
    if (!numbers.length) return null;
    return numbers.reduce(function (sum, value) { return sum + value; }, 0) / numbers.length;
  }

  function qualityStars(value) {
    var count = Math.max(1, Math.min(5, Number(value) || 3));
    return "★".repeat(count) + "☆".repeat(5 - count);
  }

  function weekdayLabel(date) {
    return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  }

  function render() {
    renderHeader();
    renderToday();
    renderTrends();
    renderHistory();
  }

  function renderHeader() {
    var now = new Date();
    $("#today-label").textContent = (now.getMonth() + 1) + "月" + now.getDate() + "日 · 星期" + weekdayLabel(now);
    $("#display-name").textContent = state.profileName;
    $("#profile-name").value = state.profileName;
    $("#bedtime-goal").value = state.bedtimeGoal;
    $("#home-goal-legend").innerHTML = "<i></i>目标 ≤" + state.bedtimeGoal + " · 7–9h";
    document.title = state.profileName + "专属 · 日常健康手帐";
  }

  function latestRecord() {
    var todayKey = localDateKey(new Date());
    return state.records.find(function (r) { return r.date <= todayKey; }) || null;
  }

  function renderToday() {
    var latest = latestRecord();
    if (latest) {
      var duration = durationParts(sleepMinutes(latest));
      var sleepGoalStatus = isSleepOnTime(latest) ? "按时入睡" : "晚于 " + state.bedtimeGoal;
      $("#hero-status").textContent = latest.date === localDateKey(new Date()) ? "今日已记录 · " + sleepGoalStatus : "最近记录 · " + formatShortDate(latest.date);
      $("#hero-hours").textContent = duration.hours;
      $("#hero-minutes").textContent = String(duration.minutes).padStart(2, "0");
      $("#hero-range").textContent = latest.bedtime + " 入睡 · " + latest.waketime + " 起床 · " + qualityStars(latest.quality);
    } else {
      $("#hero-status").textContent = "今晚还未记录";
      $("#hero-hours").textContent = "--";
      $("#hero-minutes").textContent = "--";
      $("#hero-range").textContent = "记录后，在这里看见你的休息节律";
    }

    var recent = recordsWithin(7);
    var avg = average(recent.map(sleepMinutes));
    $("#metric-average").textContent = avg === null ? "--" : compactDuration(Math.round(avg));
    var todayKey = localDateKey(new Date());
    var todayPoop = state.poopRecords.filter(function (r) { return r.date === todayKey; });
    var todayCalcium = state.calciumRecords.filter(function (r) { return r.date === todayKey; });
    var calciumTotal = todayCalcium.reduce(function (sum, r) { return sum + Number(r.dose || 0); }, 0);
    $("#metric-poop").textContent = todayPoop.length + " 次";
    $("#metric-poop-note").textContent = todayPoop.length ? "今日已记录" : "等待记录";
    $("#metric-calcium").textContent = calciumTotal + " mg";
    $("#metric-calcium-note").textContent = todayCalcium.length ? todayCalcium.length + " 次补充" : "等待记录";
    renderWeekBars(recent);
  }

  function renderWeekBars(records) {
    var today = new Date();
    var byDate = {};
    records.forEach(function (r) { byDate[r.date] = r; });
    var barHtml = "";
    var labelHtml = "";
    for (var i = 6; i >= 0; i -= 1) {
      var day = shiftDate(today, -i);
      var key = localDateKey(day);
      var record = byDate[key];
      var minutes = record ? sleepMinutes(record) : 0;
      var pct = Math.max(5, Math.min(100, minutes / MAX_CHART_MINUTES * 100));
      var classes = ["bar"];
      if (!record) classes.push("empty");
      if (record && minutes >= 7 * 60 && minutes <= 9 * 60 && isSleepOnTime(record)) classes.push("on-target");
      if (record && !isSleepOnTime(record)) classes.push("late");
      if (i === 0) classes.push("today");
      barHtml += '<span class="' + classes.join(" ") + '" style="height:' + pct + '%" data-value="' + (record ? (minutes / 60).toFixed(1) + "h" : "") + '"></span>';
      labelHtml += "<span>" + (i === 0 ? "今" : "周" + weekdayLabel(day)) + "</span>";
    }
    $("#home-bars").innerHTML = barHtml;
    $("#home-labels").innerHTML = labelHtml;
  }

  function renderTrends() {
    var data = recordsWithin(state.period);
    var periodStart = localDateKey(shiftDate(new Date(), -(state.period - 1)));
    var periodEnd = localDateKey(new Date());
    var periodPoop = state.poopRecords.filter(function (r) { return r.date >= periodStart && r.date <= periodEnd; });
    var periodCalcium = state.calciumRecords.filter(function (r) { return r.date >= periodStart && r.date <= periodEnd; });
    var durations = data.map(sleepMinutes);
    var avg = average(durations);
    var avgQuality = average(data.map(function (r) { return Number(r.quality) || 3; }));
    var onTimeRate = data.length ? Math.round(data.filter(isSleepOnTime).length / data.length * 100) : null;
    $("#trend-average").textContent = avg === null ? "--" : compactDuration(Math.round(avg));
    $("#trend-average-delta").textContent = onTimeRate === null ? "暂无入睡记录" : "按时入睡 " + onTimeRate + "%";
    $("#trend-quality").textContent = avgQuality === null ? "--" : avgQuality.toFixed(1) + "/5";
    $("#trend-consistency").textContent = consistencyLabel(data);
    $("#trend-poop").textContent = periodPoop.length + " 次";
    $("#trend-poop-days").textContent = new Set(periodPoop.map(function (r) { return r.date; })).size + " 天有记录";
    $("#trend-calcium").textContent = periodCalcium.reduce(function (sum, r) { return sum + Number(r.dose || 0); }, 0) + " mg";
    $("#trend-calcium-days").textContent = new Set(periodCalcium.map(function (r) { return r.date; })).size + " 天有记录";
    $("#trend-chart-title").textContent = "最近 " + state.period + " 天";
    renderTrendChart(data);
    renderTiming(data);
    renderInsight(data);
    renderCalendar();
  }

  function renderCalendar() {
    var month = state.calendarMonth;
    var year = month.getFullYear();
    var monthIndex = month.getMonth();
    $("#calendar-month-title").textContent = year + "年" + (monthIndex + 1) + "月";
    var first = new Date(year, monthIndex, 1);
    var mondayOffset = (first.getDay() + 6) % 7;
    var gridStart = shiftDate(first, -mondayOffset);
    var todayKey = localDateKey(new Date());
    var cells = "";
    for (var i = 0; i < 42; i += 1) {
      var date = shiftDate(gridStart, i);
      var key = localDateKey(date);
      var inMonth = date.getMonth() === monthIndex;
      var classes = ["calendar-day"];
      var detail = "无记录";
      if (!inMonth) classes.push("outside");
      if (key === todayKey) classes.push("today-cell");
      if (inMonth && state.calendarMetric === "sleep") {
        var sleepRecord = state.records.find(function (r) { return r.date === key; });
        if (sleepRecord) {
          var onTime = isSleepOnTime(sleepRecord);
          classes.push(onTime ? "sleep-good" : "sleep-late");
          detail = sleepRecord.bedtime + " 入睡 · " + (onTime ? "按时" : "晚于 " + state.bedtimeGoal);
        }
      } else if (inMonth && state.calendarMetric === "poop") {
        var poopCount = state.poopRecords.filter(function (r) { return r.date === key; }).length;
        if (poopCount) classes.push("heat-" + Math.min(3, poopCount));
        detail = poopCount ? "噗噗 " + poopCount + " 次" : "无记录";
      } else if (inMonth && state.calendarMetric === "calcium") {
        var calciumTotal = state.calciumRecords.filter(function (r) { return r.date === key; }).reduce(function (sum, r) { return sum + Number(r.dose || 0); }, 0);
        if (calciumTotal) classes.push(calciumTotal >= 600 ? "heat-3" : calciumTotal >= 400 ? "heat-2" : "heat-1");
        detail = calciumTotal ? "补钙 " + calciumTotal + " mg" : "无记录";
      }
      cells += '<span class="' + classes.join(" ") + '" title="' + (date.getMonth() + 1) + "月" + date.getDate() + "日 · " + detail + '"><b>' + date.getDate() + "</b></span>";
    }
    $("#calendar-grid").innerHTML = cells;
    if (state.calendarMetric === "sleep") {
      $("#calendar-legend").innerHTML = '<span><i></i>无记录</span><span><i class="sleep-good"></i>按时（≤ ' + state.bedtimeGoal + '）</span><span><i class="sleep-late"></i>晚睡</span>';
    } else if (state.calendarMetric === "poop") {
      $("#calendar-legend").innerHTML = '<span><i></i>无记录</span><span><i class="heat-1"></i>1 次</span><span><i class="heat-2"></i>2 次</span><span><i class="heat-3"></i>3 次以上</span>';
    } else {
      $("#calendar-legend").innerHTML = '<span><i></i>无记录</span><span><i class="heat-1"></i>1–399mg</span><span><i class="heat-2"></i>400–599mg</span><span><i class="heat-3"></i>≥600mg</span>';
    }
  }

  function consistencyLabel(records) {
    if (records.length < 2) return "--";
    var adjusted = records.map(function (r) {
      var minutes = timeToMinutes(r.bedtime);
      return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
    });
    var mean = average(adjusted);
    var variance = average(adjusted.map(function (n) { return Math.pow(n - mean, 2); }));
    var deviation = Math.sqrt(variance);
    if (deviation <= 30) return "很规律";
    if (deviation <= 60) return "较规律";
    if (deviation <= 90) return "有波动";
    return "需调整";
  }

  function renderTrendChart(records) {
    var holder = $("#line-chart");
    if (records.length < 2) {
      holder.innerHTML = '<div class="empty-chart">至少记录 2 天后显示趋势曲线</div>';
      return;
    }
    var sorted = records.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var width = 340;
    var height = 180;
    var left = 22;
    var right = 10;
    var top = 14;
    var bottom = 28;
    var usableW = width - left - right;
    var usableH = height - top - bottom;
    var minM = 4 * 60;
    var maxM = 11 * 60;
    var points = sorted.map(function (r, index) {
      var x = left + (sorted.length === 1 ? usableW / 2 : index / (sorted.length - 1) * usableW);
      var clipped = Math.max(minM, Math.min(maxM, sleepMinutes(r)));
      var y = top + (maxM - clipped) / (maxM - minM) * usableH;
      return { x: x, y: y, record: r };
    });
    var path = points.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
    var areaPath = path + " L " + points[points.length - 1].x.toFixed(1) + " " + (top + usableH) + " L " + points[0].x.toFixed(1) + " " + (top + usableH) + " Z";
    var labels = [5, 8, 11].map(function (hour) {
      var y = top + (maxM - hour * 60) / (maxM - minM) * usableH;
      return '<line class="chart-grid-line" x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '"/><text class="chart-axis-label" x="0" y="' + (y + 3) + '">' + hour + 'h</text>';
    }).join("");
    var pointHtml = points.map(function (p, i) {
      var label = "";
      if (sorted.length <= 10 || i === 0 || i === sorted.length - 1) {
        var d = parseDateKey(p.record.date);
        label = '<text class="chart-axis-label" text-anchor="middle" x="' + p.x + '" y="' + (height - 4) + '">' + (d.getMonth() + 1) + "/" + d.getDate() + "</text>";
      }
      return '<circle class="chart-point" cx="' + p.x + '" cy="' + p.y + '" r="3.5"><title>' + compactDuration(sleepMinutes(p.record)) + '</title></circle>' + label;
    }).join("");
    holder.innerHTML = '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="睡眠时长趋势图"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#75b296" stop-opacity=".28"/><stop offset="1" stop-color="#75b296" stop-opacity="0"/></linearGradient></defs>' + labels + '<path class="chart-area" d="' + areaPath + '"/><path class="chart-path" d="' + path + '"/>' + pointHtml + "</svg>";
  }

  function circularAverage(minutesArray) {
    if (!minutesArray.length) return null;
    var sin = 0;
    var cos = 0;
    minutesArray.forEach(function (minutes) {
      var angle = minutes / 1440 * Math.PI * 2;
      sin += Math.sin(angle);
      cos += Math.cos(angle);
    });
    var angle = Math.atan2(sin / minutesArray.length, cos / minutesArray.length);
    if (angle < 0) angle += Math.PI * 2;
    return Math.round(angle / (Math.PI * 2) * 1440) % 1440;
  }

  function minutesToClock(minutes) {
    if (minutes === null) return "--:--";
    return String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
  }

  function renderTiming(records) {
    var bed = circularAverage(records.map(function (r) { return timeToMinutes(r.bedtime); }));
    var wake = circularAverage(records.map(function (r) { return timeToMinutes(r.waketime); }));
    $("#avg-bedtime").textContent = minutesToClock(bed);
    $("#avg-waketime").textContent = minutesToClock(wake);
    $("#timing-span").style.width = records.length ? "100%" : "0";
  }

  function renderInsight(records) {
    var title = "开始记录你的睡眠";
    var text = "连续记录几天后，这里会出现关于睡眠时长与规律度的个性化提示。";
    if (records.length >= 2) {
      var avg = average(records.map(sleepMinutes));
      var goalDays = records.filter(function (r) { return sleepMinutes(r) >= GOAL_MINUTES; }).length;
      if (avg < 6 * 60) {
        title = "最近睡眠偏少";
        text = "平均睡眠不足 6 小时。可以尝试把上床时间提前 20–30 分钟，先从小幅调整开始。";
      } else if (goalDays / records.length >= .7) {
        title = "你的睡眠时长很稳定";
        text = "多数记录达到了 7 小时目标。继续保持相近的入睡和起床时间，会更有利于稳定节律。";
      } else {
        title = "试着让作息更规律";
        text = "目前睡眠时长有一些波动。优先固定起床时间，通常比强迫自己按时入睡更容易坚持。";
      }
    }
    $("#insight-title").textContent = title;
    $("#insight-text").textContent = text;
  }

  function formatShortDate(key) {
    var d = parseDateKey(key);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function renderHistory() {
    var list = $("#history-list");
    var events = [];
    state.records.forEach(function (r) { events.push({ type: "sleep", date: r.date, time: r.bedtime, data: r }); });
    state.poopRecords.forEach(function (r) { events.push({ type: "poop", date: r.date, time: r.time, data: r }); });
    state.calciumRecords.forEach(function (r) { events.push({ type: "calcium", date: r.date, time: r.time, data: r }); });
    events.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    $("#history-count").textContent = events.length ? "共 " + events.length + " 条日常记录" : "还没有记录";
    if (!events.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-moon"></div><h3>从今天开始</h3><p>睡眠、噗噗和补钙，<br>小小记录也会变成有用的节律。</p></div>';
      return;
    }
    var groups = {};
    events.forEach(function (event) {
      var key = event.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    list.innerHTML = Object.keys(groups).sort().reverse().map(function (monthKey) {
      var parts = monthKey.split("-");
      var title = parts[0] + "年" + Number(parts[1]) + "月";
      var items = groups[monthKey].map(function (event) {
        var record = event.data;
        var date = parseDateKey(event.date);
        var dateTile = '<span class="date-tile ' + event.type + '-tile"><strong>' + date.getDate() + '</strong><small>周' + weekdayLabel(date) + '</small></span>';
        if (event.type === "sleep") {
          return '<button class="history-item" data-edit="' + record.id + '">' + dateTile + '<span class="history-main"><i class="event-tag">睡眠</i><strong>' + record.bedtime + ' → ' + record.waketime + '</strong><small>' + (record.note ? escapeHtml(record.note) : "无备注") + '</small></span><span class="history-duration"><strong>' + compactDuration(sleepMinutes(record)) + '</strong><small>' + qualityStars(record.quality) + "</small></span></button>";
        }
        if (event.type === "poop") {
          return '<button class="history-item" data-edit-poop="' + record.id + '">' + dateTile + '<span class="history-main"><i class="event-tag poop-tag">噗噗</i><strong>' + record.time + ' · ' + escapeHtml(record.condition || "正常") + '</strong><small>' + (record.note ? escapeHtml(record.note) : "顺利完成一次") + '</small></span><span class="history-duration"><strong>1 次</strong><small>已记录</small></span></button>';
        }
        return '<button class="history-item" data-edit-calcium="' + record.id + '">' + dateTile + '<span class="history-main"><i class="event-tag calcium-tag">补钙</i><strong>' + record.time + ' · ' + Number(record.dose) + ' mg</strong><small>' + (record.note ? escapeHtml(record.note) : "补钙打卡") + '</small></span><span class="history-duration"><strong>' + Number(record.dose) + '</strong><small>mg</small></span></button>';
      }).join("");
      return '<section><h3 class="month-title">' + title + '</h3><div class="history-group">' + items + "</div></section>";
    }).join("");
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function switchView(name) {
    state.activeView = name;
    $$(".view").forEach(function (view) { view.classList.toggle("active", view.id === "view-" + name); });
    $$(".bottom-nav button").forEach(function (button) { button.classList.toggle("active", button.dataset.view === name); });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openRecordSheet(record) {
    var isEdit = Boolean(record);
    $("#sheet-eyebrow").textContent = isEdit ? "编辑" : "新增";
    $("#sheet-title").textContent = isEdit ? "编辑睡眠记录" : "记录睡眠";
    $("#edit-id").value = isEdit ? record.id : "";
    $("#sleep-date").value = isEdit ? record.date : localDateKey(new Date());
    $("#bedtime").value = isEdit ? record.bedtime : "23:30";
    $("#waketime").value = isEdit ? record.waketime : "07:30";
    $("#sleep-note").value = isEdit ? (record.note || "") : "";
    var quality = isEdit ? String(record.quality || 3) : "3";
    var radio = $('input[name="quality"][value="' + quality + '"]');
    if (radio) radio.checked = true;
    $("#delete-entry").hidden = !isEdit;
    updateDurationPreview();
    $("#record-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function currentTimeValue() {
    var now = new Date();
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function openPoopSheet(record) {
    var isEdit = Boolean(record);
    $("#poop-eyebrow").textContent = isEdit ? "编辑" : "新增";
    $("#poop-title").textContent = isEdit ? "编辑噗噗记录" : "记录噗噗";
    $("#poop-edit-id").value = isEdit ? record.id : "";
    $("#poop-date").value = isEdit ? record.date : localDateKey(new Date());
    $("#poop-time").value = isEdit ? record.time : currentTimeValue();
    $("#poop-note").value = isEdit ? (record.note || "") : "";
    var condition = isEdit ? (record.condition || "正常") : "正常";
    var radio = $('input[name="poop-condition"][value="' + condition + '"]');
    if (radio) radio.checked = true;
    $("#delete-poop").hidden = !isEdit;
    $("#poop-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function openCalciumSheet(record) {
    var isEdit = Boolean(record);
    $("#calcium-eyebrow").textContent = isEdit ? "编辑" : "新增";
    $("#calcium-title").textContent = isEdit ? "编辑补钙记录" : "记录补钙";
    $("#calcium-edit-id").value = isEdit ? record.id : "";
    $("#calcium-date").value = isEdit ? record.date : localDateKey(new Date());
    $("#calcium-time").value = isEdit ? record.time : currentTimeValue();
    $("#calcium-dose").value = isEdit ? Number(record.dose) : 500;
    $("#calcium-note").value = isEdit ? (record.note || "") : "";
    $("#delete-calcium").hidden = !isEdit;
    $("#calcium-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSheet(id) {
    $(id).hidden = true;
    if ($("#record-backdrop").hidden && $("#poop-backdrop").hidden && $("#calcium-backdrop").hidden && $("#settings-backdrop").hidden) document.body.style.overflow = "";
  }

  function updateDurationPreview() {
    var temp = { bedtime: $("#bedtime").value, waketime: $("#waketime").value };
    if (!temp.bedtime || !temp.waketime) return;
    var minutes = sleepMinutes(temp);
    $("#duration-preview").textContent = minutes > 16 * 60 ? "请检查时间" : chineseDuration(minutes);
  }

  function showToast(message) {
    var toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  function handleSubmit(event) {
    event.preventDefault();
    var entry = {
      id: $("#edit-id").value || String(Date.now()),
      date: $("#sleep-date").value,
      bedtime: $("#bedtime").value,
      waketime: $("#waketime").value,
      quality: Number($('input[name="quality"]:checked').value),
      note: $("#sleep-note").value.trim()
    };
    var duration = sleepMinutes(entry);
    if (duration < 30 || duration > 16 * 60) {
      showToast("请检查入睡和起床时间");
      return;
    }
    var sameDate = state.records.find(function (r) { return r.date === entry.date && r.id !== entry.id; });
    if (sameDate) entry.id = sameDate.id;
    state.records = state.records.filter(function (r) { return r.id !== entry.id && r.date !== entry.date; });
    state.records.push(entry);
    saveRecords();
    closeSheet("#record-backdrop");
    render();
    showToast("睡眠记录已保存");
  }

  function deleteCurrentEntry() {
    var id = $("#edit-id").value;
    if (!id) return;
    if (!window.confirm("确定删除这条睡眠记录吗？")) return;
    state.records = state.records.filter(function (r) { return r.id !== id; });
    saveRecords();
    closeSheet("#record-backdrop");
    render();
    showToast("记录已删除");
  }

  function handlePoopSubmit(event) {
    event.preventDefault();
    var entry = {
      id: $("#poop-edit-id").value || "p" + Date.now(),
      date: $("#poop-date").value,
      time: $("#poop-time").value,
      condition: $('input[name="poop-condition"]:checked').value,
      note: $("#poop-note").value.trim()
    };
    state.poopRecords = state.poopRecords.filter(function (r) { return r.id !== entry.id; });
    state.poopRecords.push(entry);
    saveWellnessRecords();
    closeSheet("#poop-backdrop");
    render();
    showToast("噗噗记录已保存");
  }

  function handleCalciumSubmit(event) {
    event.preventDefault();
    var dose = Number($("#calcium-dose").value);
    if (!dose || dose < 1 || dose > 3000) {
      showToast("请输入 1–3000 mg 的剂量");
      return;
    }
    var entry = {
      id: $("#calcium-edit-id").value || "c" + Date.now(),
      date: $("#calcium-date").value,
      time: $("#calcium-time").value,
      dose: dose,
      note: $("#calcium-note").value.trim()
    };
    state.calciumRecords = state.calciumRecords.filter(function (r) { return r.id !== entry.id; });
    state.calciumRecords.push(entry);
    saveWellnessRecords();
    closeSheet("#calcium-backdrop");
    render();
    showToast("补钙记录已保存");
  }

  function deletePoopEntry() {
    var id = $("#poop-edit-id").value;
    if (!id || !window.confirm("确定删除这条噗噗记录吗？")) return;
    state.poopRecords = state.poopRecords.filter(function (r) { return r.id !== id; });
    saveWellnessRecords();
    closeSheet("#poop-backdrop");
    render();
    showToast("噗噗记录已删除");
  }

  function deleteCalciumEntry() {
    var id = $("#calcium-edit-id").value;
    if (!id || !window.confirm("确定删除这条补钙记录吗？")) return;
    state.calciumRecords = state.calciumRecords.filter(function (r) { return r.id !== id; });
    saveWellnessRecords();
    closeSheet("#calcium-backdrop");
    render();
    showToast("补钙记录已删除");
  }

  function exportData() {
    var payload = { app: "眠迹", version: 4, profileName: state.profileName, bedtimeGoal: state.bedtimeGoal, exportedAt: new Date().toISOString(), records: state.records, poopRecords: state.poopRecords, calciumRecords: state.calciumRecords };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "眠迹睡眠记录_" + localDateKey(new Date()) + ".json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("备份已导出");
  }

  function importData(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var records = Array.isArray(parsed) ? parsed : parsed.records;
        if (!Array.isArray(records)) throw new Error("Invalid data");
        records = records.filter(isValidRecord).map(function (r) {
          return {
            id: String(r.id || Date.now() + Math.random()),
            date: r.date,
            bedtime: r.bedtime,
            waketime: r.waketime,
            quality: Math.max(1, Math.min(5, Number(r.quality) || 3)),
            note: String(r.note || "").slice(0, 80)
          };
        });
        var poopRecords = !Array.isArray(parsed) && Array.isArray(parsed.poopRecords) ? parsed.poopRecords.filter(function (r) {
          return r && r.date && r.time;
        }).map(function (r) {
          return { id: String(r.id || "p" + Date.now() + Math.random()), date: r.date, time: r.time, condition: String(r.condition || "正常"), note: String(r.note || "").slice(0, 80) };
        }) : [];
        var calciumRecords = !Array.isArray(parsed) && Array.isArray(parsed.calciumRecords) ? parsed.calciumRecords.filter(function (r) {
          return r && r.date && r.time && Number(r.dose) > 0;
        }).map(function (r) {
          return { id: String(r.id || "c" + Date.now() + Math.random()), date: r.date, time: r.time, dose: Math.min(3000, Number(r.dose)), note: String(r.note || "").slice(0, 80) };
        }) : [];
        var merged = {};
        state.records.concat(records).forEach(function (r) { merged[r.date] = r; });
        state.records = Object.keys(merged).map(function (key) { return merged[key]; });
        state.poopRecords = state.poopRecords.concat(poopRecords);
        state.calciumRecords = state.calciumRecords.concat(calciumRecords);
        if (!Array.isArray(parsed) && parsed.profileName) {
          state.profileName = String(parsed.profileName).trim().slice(0, 12) || state.profileName;
        }
        if (!Array.isArray(parsed) && /^\d{2}:\d{2}$/.test(parsed.bedtimeGoal || "")) state.bedtimeGoal = parsed.bedtimeGoal;
        saveProfileName();
        saveRecords();
        saveWellnessRecords();
        render();
        closeSheet("#settings-backdrop");
        showToast("已导入 " + (records.length + poopRecords.length + calciumRecords.length) + " 条记录");
      } catch (error) {
        showToast("无法识别这个备份文件");
      }
      $("#import-data").value = "";
    };
    reader.readAsText(file);
  }

  function bindEvents() {
    $$(".bottom-nav button").forEach(function (button) {
      button.addEventListener("click", function () { switchView(button.dataset.view); });
    });
    $$("[data-go]").forEach(function (button) {
      button.addEventListener("click", function () { switchView(button.dataset.go); });
    });
    $("#quick-add").addEventListener("click", function () { openRecordSheet(); });
    $("#quick-poop").addEventListener("click", function () { openPoopSheet(); });
    $("#quick-calcium").addEventListener("click", function () { openCalciumSheet(); });
    $("#history-add").addEventListener("click", function () { openRecordSheet(); });
    $("#close-sheet").addEventListener("click", function () { closeSheet("#record-backdrop"); });
    $("#sleep-form").addEventListener("submit", handleSubmit);
    $("#bedtime").addEventListener("input", updateDurationPreview);
    $("#waketime").addEventListener("input", updateDurationPreview);
    $("#delete-entry").addEventListener("click", deleteCurrentEntry);
    $("#close-poop").addEventListener("click", function () { closeSheet("#poop-backdrop"); });
    $("#close-calcium").addEventListener("click", function () { closeSheet("#calcium-backdrop"); });
    $("#poop-form").addEventListener("submit", handlePoopSubmit);
    $("#calcium-form").addEventListener("submit", handleCalciumSubmit);
    $("#delete-poop").addEventListener("click", deletePoopEntry);
    $("#delete-calcium").addEventListener("click", deleteCalciumEntry);
    $$("[data-dose]").forEach(function (button) {
      button.addEventListener("click", function () { $("#calcium-dose").value = button.dataset.dose; });
    });
    $("#history-list").addEventListener("click", function (event) {
      var sleepButton = event.target.closest("[data-edit]");
      var poopButton = event.target.closest("[data-edit-poop]");
      var calciumButton = event.target.closest("[data-edit-calcium]");
      if (sleepButton) {
        var sleepRecord = state.records.find(function (r) { return r.id === sleepButton.dataset.edit; });
        if (sleepRecord) openRecordSheet(sleepRecord);
      } else if (poopButton) {
        var poopRecord = state.poopRecords.find(function (r) { return r.id === poopButton.dataset.editPoop; });
        if (poopRecord) openPoopSheet(poopRecord);
      } else if (calciumButton) {
        var calciumRecord = state.calciumRecords.find(function (r) { return r.id === calciumButton.dataset.editCalcium; });
        if (calciumRecord) openCalciumSheet(calciumRecord);
      }
    });
    $$(".period-switch button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.period = Number(button.dataset.period);
        $$(".period-switch button").forEach(function (item) { item.classList.toggle("active", item === button); });
        renderTrends();
      });
    });
    $$("[data-calendar-metric]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.calendarMetric = button.dataset.calendarMetric;
        $$("[data-calendar-metric]").forEach(function (item) { item.classList.toggle("active", item === button); });
        renderCalendar();
      });
    });
    $("#calendar-prev").addEventListener("click", function () {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    $("#calendar-next").addEventListener("click", function () {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    $("#open-settings").addEventListener("click", function () {
      $("#profile-name").value = state.profileName;
      $("#bedtime-goal").value = state.bedtimeGoal;
      $("#settings-backdrop").hidden = false;
      document.body.style.overflow = "hidden";
    });
    $("#save-profile").addEventListener("click", function () {
      var nextName = $("#profile-name").value.trim().slice(0, 12);
      if (!nextName) {
        showToast("请输入专属名称");
        $("#profile-name").focus();
        return;
      }
      var nextGoal = $("#bedtime-goal").value;
      if (!/^\d{2}:\d{2}$/.test(nextGoal)) {
        showToast("请选择最晚入睡时间");
        return;
      }
      state.profileName = nextName;
      state.bedtimeGoal = nextGoal;
      saveProfileName();
      render();
      showToast("专属设置已更新");
    });
    $("#profile-name").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        $("#save-profile").click();
      }
    });
    $("#close-settings").addEventListener("click", function () { closeSheet("#settings-backdrop"); });
    $("#export-data").addEventListener("click", exportData);
    $("#import-data").addEventListener("change", function (event) { importData(event.target.files[0]); });
    $("#clear-data").addEventListener("click", function () {
      if (!state.records.length && !state.poopRecords.length && !state.calciumRecords.length) return showToast("当前没有可清空的数据");
      if (!window.confirm("确定清空全部日常记录吗？此操作无法撤销。")) return;
      state.records = [];
      state.poopRecords = [];
      state.calciumRecords = [];
      saveRecords();
      saveWellnessRecords();
      render();
      closeSheet("#settings-backdrop");
      showToast("全部记录已清空");
    });
    ["#record-backdrop", "#poop-backdrop", "#calcium-backdrop", "#settings-backdrop"].forEach(function (id) {
      $(id).addEventListener("click", function (event) {
        if (event.target === $(id)) closeSheet(id);
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeSheet("#record-backdrop");
      closeSheet("#poop-backdrop");
      closeSheet("#calcium-backdrop");
      closeSheet("#settings-backdrop");
    });
  }

  bindEvents();
  render();
})();
