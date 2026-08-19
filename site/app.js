(() => {
  const state = {
    data: null,
    dayId: null,
    map: null,
    layer: null,
    markers: [],
  };

  const el = {
    tabs: document.getElementById("day-tabs"),
    body: document.getElementById("day-body"),
    stay: document.getElementById("stay"),
    lede: document.getElementById("lede"),
    copy: document.getElementById("copy-link"),
    allMaps: document.getElementById("all-maps"),
    panel: document.getElementById("panel"),
    toggle: document.getElementById("toggle-panel"),
  };

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const reservationMeta = {
    booked: { label: "예약 완료", className: "badge-booked" },
    recommended: { label: "예약 권장", className: "badge-recommended" },
    walk_in: { label: "워크인", className: "badge-walkin" },
    check: { label: "확인 필요", className: "badge-check" },
    optional: { label: "선택", className: "badge-optional" },
    none: { label: "예약 불필요", className: "badge-none" },
  };

  function reservationBadge(status) {
    const meta = reservationMeta[status];
    if (!meta) return "";
    return `<span class="badge ${meta.className}">${meta.label}</span>`;
  }

  function initMap() {
    state.map = L.map("map", { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(state.map);
    state.layer = L.layerGroup().addTo(state.map);
    state.map.setView([41.387, 2.17], 13);
  }

  function stayMarker(stay) {
    if (!stay?.lat) return null;
    const icon = L.divIcon({
      className: "",
      html: `<div style="background:#c45c3e;color:#fff;border-radius:8px;padding:4px 8px;font:600 12px Outfit,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);white-space:nowrap">숙소</div>`,
      iconSize: [48, 24],
      iconAnchor: [24, 12],
    });
    return L.marker([stay.lat, stay.lng], { icon }).bindPopup(
      `<strong>${escapeHtml(stay.name)}</strong>${escapeHtml(stay.address || stay.note || "")}`
    );
  }

  function placeIcon(order, locked) {
    const bg = locked ? "#0f4c5c" : "#1e6f8a";
    return L.divIcon({
      className: "",
      html: `<div style="width:28px;height:28px;border-radius:50%;background:${bg};color:#fff;display:grid;place-items:center;font:600 12px Outfit,sans-serif;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)">${order}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  function renderMap(day) {
    state.layer.clearLayers();
    state.markers = [];
    const bounds = [];

    const sm = stayMarker(state.data.stay);
    if (sm) {
      sm.addTo(state.layer);
      bounds.push([state.data.stay.lat, state.data.stay.lng]);
    }

    const route = [];
    day.places.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const m = L.marker([p.lat, p.lng], {
        icon: placeIcon(p.order, p.locked),
      }).bindPopup(
        `<strong>${escapeHtml(p.order)}. ${escapeHtml(p.name)}</strong><span class="popup-status">${reservationBadge(p.reservation_status)}</span><span>${escapeHtml(p.time || "")} · ${escapeHtml(p.duration || "")}</span><br/>${escapeHtml(p.note || "")}`
      );
      m.addTo(state.layer);
      state.markers.push({ id: p.id || String(p.order), marker: m, place: p });
      bounds.push([p.lat, p.lng]);
      if (!p.exclude_from_route) route.push([p.lat, p.lng]);
    });

    if (route.length >= 2) {
      L.polyline(route, {
        color: "#1e6f8a",
        weight: 4,
        opacity: 0.75,
        dashArray: "6 8",
      }).addTo(state.layer);
    }

    if (bounds.length) {
      state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
    setTimeout(() => state.map.invalidateSize(), 50);
  }

  function renderStay() {
    const s = state.data.stay;
    if (!s) {
      el.stay.innerHTML = "";
      return;
    }
    el.stay.innerHTML = `
      <strong>${escapeHtml(s.name)} <span class="badge badge-lock">고정</span></strong>
      <p>${escapeHtml(s.address || s.note || "")}</p>
      ${s.google_maps ? `<p style="margin-top:.35rem"><a class="pin-link" href="${s.google_maps}" target="_blank" rel="noopener">지도에서 숙소</a></p>` : ""}
    `;
  }

  function renderTabs() {
    el.tabs.innerHTML = "";
    state.data.days_plan.forEach((day) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = day.label;
      b.className = day.id === state.dayId ? "active" : "";
      b.addEventListener("click", () => selectDay(day.id));
      el.tabs.appendChild(b);
    });
  }

  function renderDay() {
    const day = state.data.days_plan.find((d) => d.id === state.dayId);
    if (!day) return;

    el.allMaps.href = day.google_maps_directions || "#";
    el.allMaps.textContent = `${day.label} 동선`;

    const places = day.places.length
      ? day.places
          .map((p) => {
            const lock = p.locked ? `<span class="badge badge-lock">고정</span>` : "";
            const opt = p.optional ? `<span class="badge badge-opt">선택</span>` : "";
            const reservation = reservationBadge(p.reservation_status);
            const tbd =
              p.lat == null ? `<span class="badge badge-opt">미정</span>` : "";
            const pin =
              p.lat != null
                ? `<a class="pin-link" href="${p.google_maps || "#"}" target="_blank" rel="noopener" onclick="event.stopPropagation()">구글맵</a>`
                : `<span class="pin-link" style="opacity:.45">미정</span>`;
            return `
        <li class="place" data-id="${escapeHtml(p.id || p.order)}" tabindex="0">
          <span class="num">${p.order}</span>
          <div>
            <h3>${escapeHtml(p.name)}${lock}${opt}${tbd}</h3>
            <div class="place-status">${reservation}</div>
            <p class="meta">${escapeHtml(p.time || "")} · ${escapeHtml(p.duration || "")}</p>
            <p class="note">${escapeHtml(p.note || "")}</p>
          </div>
          ${pin}
        </li>`;
          })
          .join("")
      : `<li class="place" style="cursor:default"><div><p class="note">아직 스팟이 없어요. 확정되면 알려주세요.</p></div></li>`;

    const tips = (day.tips || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");

    const dateLine = day.date
      ? `<p class="day-theme">${escapeHtml(day.date)}</p>`
      : "";

    el.body.innerHTML = `
      <article class="day-card">
        <h2>${escapeHtml(day.title)}</h2>
        ${dateLine}
        <p class="day-theme">${escapeHtml(day.theme || "")}</p>
        <p class="day-summary">${escapeHtml(day.summary || "")}</p>
        <ul class="places">${places}</ul>
        ${tips ? `<div class="tips"><strong>팁</strong><ul>${tips}</ul></div>` : ""}
      </article>
    `;

    el.body.querySelectorAll(".place").forEach((node) => {
      const focus = () => {
        el.body.querySelectorAll(".place").forEach((n) => n.classList.remove("active-place"));
        node.classList.add("active-place");
        const id = node.getAttribute("data-id");
        const found = state.markers.find((m) => String(m.id) === String(id));
        if (found) {
          state.map.setView(found.marker.getLatLng(), Math.max(state.map.getZoom(), 15), {
            animate: true,
          });
          found.marker.openPopup();
        }
      };
      node.addEventListener("click", focus);
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focus();
        }
      });
    });

    renderMap(day);
  }

  function selectDay(id) {
    state.dayId = id;
    if (location.hash !== `#${id}`) {
      history.replaceState(null, "", `#${id}`);
    }
    renderTabs();
    renderDay();
  }

  el.copy.addEventListener("click", async () => {
    const url = location.href.split("#")[0];
    try {
      await navigator.clipboard.writeText(url);
      el.copy.textContent = "복사됨!";
      setTimeout(() => {
        el.copy.textContent = "링크 복사";
      }, 1500);
    } catch {
      prompt("이 링크를 복사하세요", url);
    }
  });

  el.toggle.addEventListener("click", () => {
    el.panel.classList.toggle("collapsed");
    setTimeout(() => state.map.invalidateSize(), 280);
  });

  async function boot() {
    initMap();
    const res = await fetch("./data/itinerary.json", { cache: "no-store" });
    state.data = await res.json();
    document.title = `${state.data.title} · 우리 일정`;
    const eyebrow = document.getElementById("eyebrow");
    if (eyebrow) {
      const n = state.data.nights ?? "";
      const d = state.data.days ?? "";
      const arr = state.data.dates?.arrival?.date?.slice(5).replace("-", "/") || "";
      const dep = state.data.dates?.departure?.date?.slice(5).replace("-", "/") || "";
      eyebrow.textContent = arr
        ? `Barcelona · ${n}N/${d}D · ${arr}–${dep}`
        : `Barcelona · ${n}N / ${d}D`;
    }
    el.lede.textContent =
      state.data.share?.note ||
      state.data.assumptions?.companions ||
      "링크만 있으면 같이 볼 수 있어요.";
    renderStay();
    const requested = location.hash.slice(1);
    const initial = state.data.days_plan.some((day) => day.id === requested)
      ? requested
      : state.data.days_plan[0]?.id;
    selectDay(initial);
  }

  boot().catch((err) => {
    el.body.innerHTML = `<p>일정을 불러오지 못했습니다. site/data/itinerary.json 을 확인하세요.</p>`;
    console.error(err);
  });
})();
