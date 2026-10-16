/* sw.js — работа без сети: все файлы конструктора сохраняются в телефоне при первом открытии.
 * Новая версия на сервере → новые файлы скачиваются в фоне, страница предлагает обновиться. */
'use strict';
const BUILD = '1.6.2-062eb2d84a';
const CACHE = 'zn-slides-' + BUILD;
const FILES = ["css/app.css", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/icon.svg", "index.html", "js/chart.js", "js/core.js", "js/editor.js", "js/engine.js", "js/llm-worker.js", "js/local-llm.js", "js/main.js", "js/materials.js", "js/more.js", "js/pictures.js", "js/plan.js", "js/shared.js", "js/slides-view.js", "manifest.webmanifest", "photos/catalog.json", "photos/thumbs/ph_ahts_red_vessel.jpg", "photos/thumbs/ph_arctic_iceberg.jpg", "photos/thumbs/ph_aswan_dam.jpg", "photos/thumbs/ph_bac_lieu_wind_farm.jpg", "photos/thumbs/ph_baku_black_city_derricks.jpg", "photos/thumbs/ph_baku_pumpjack_field.jpg", "photos/thumbs/ph_battery_storage_containers.jpg", "photos/thumbs/ph_biogas_farm.jpg", "photos/thumbs/ph_boardroom_oval_table.jpg", "photos/thumbs/ph_cng_filling_station.jpg", "photos/thumbs/ph_coal_power_plant_java.jpg", "photos/thumbs/ph_coastal_oil_depot.jpg", "photos/thumbs/ph_combined_cycle_plant.jpg", "photos/thumbs/ph_construction_site_crane.jpg", "photos/thumbs/ph_container_cranes_port.jpg", "photos/thumbs/ph_container_cranes_silhouette.jpg", "photos/thumbs/ph_container_feeder_ship.jpg", "photos/thumbs/ph_container_rail_terminal.jpg", "photos/thumbs/ph_container_ship_cranes.jpg", "photos/thumbs/ph_container_terminal_hamburg.jpg", "photos/thumbs/ph_container_terminal_hamburg_2.jpg", "photos/thumbs/ph_cooling_tower_aerial.jpg", "photos/thumbs/ph_cooling_tower_windmill.jpg", "photos/thumbs/ph_cooling_towers_green.jpg", "photos/thumbs/ph_cooling_towers_steam.jpg", "photos/thumbs/ph_crude_tank_farm.jpg", "photos/thumbs/ph_drilling_rig_silhouette.jpg", "photos/thumbs/ph_drillship_docked.jpg", "photos/thumbs/ph_drillships_las_palmas.jpg", "photos/thumbs/ph_earth_from_space_arctic.jpg", "photos/thumbs/ph_empty_meeting_room.jpg", "photos/thumbs/ph_filling_station_morocco.jpg", "photos/thumbs/ph_fire_engine_snow.jpg", "photos/thumbs/ph_fire_engine_zil130.jpg", "photos/thumbs/ph_fire_truck_zil.jpg", "photos/thumbs/ph_flare_chemical_plant.jpg", "photos/thumbs/ph_flare_stack_storm.jpg", "photos/thumbs/ph_flare_stack_tower.jpg", "photos/thumbs/ph_fuel_tanker_truck.jpg", "photos/thumbs/ph_gas_compressor_station.jpg", "photos/thumbs/ph_gas_pipe_valve.jpg", "photos/thumbs/ph_gas_processing_plant.jpg", "photos/thumbs/ph_glen_canyon_dam.jpg", "photos/thumbs/ph_havana_harbour.jpg", "photos/thumbs/ph_helicopter_over_sea_platform.jpg", "photos/thumbs/ph_high_rise_construction.jpg", "photos/thumbs/ph_highway_construction.jpg", "photos/thumbs/ph_hoover_dam_powerhouse.jpg", "photos/thumbs/ph_hoover_dam_towers.jpg", "photos/thumbs/ph_hydro_station_pipes.jpg", "photos/thumbs/ph_hydrogen_refuelling.jpg", "photos/thumbs/ph_hydrogen_station_fukuoka.jpg", "photos/thumbs/ph_jackup_rig_harbour.jpg", "photos/thumbs/ph_lab_bottle_clear.jpg", "photos/thumbs/ph_lab_glassware_colors.jpg", "photos/thumbs/ph_lab_heating_block.jpg", "photos/thumbs/ph_lapland_forest.jpg", "photos/thumbs/ph_library_reading_room.jpg", "photos/thumbs/ph_lng_carrier.jpg", "photos/thumbs/ph_lng_carrier_construction.jpg", "photos/thumbs/ph_lng_carrier_hammerfest.jpg", "photos/thumbs/ph_lng_carrier_sea.jpg", "photos/thumbs/ph_mobile_crane_bridge_site.jpg", "photos/thumbs/ph_moscow_city_2025.jpg", "photos/thumbs/ph_moscow_city_day.jpg", "photos/thumbs/ph_moscow_city_moon.jpg", "photos/thumbs/ph_moscow_city_night.jpg", "photos/thumbs/ph_moscow_city_sparrow_hills.jpg", "photos/thumbs/ph_moscow_exchange.jpg", "photos/thumbs/ph_north_sea_platform_deck.jpg", "photos/thumbs/ph_nuclear_cooling_tower.jpg", "photos/thumbs/ph_office_buildings_harbour.jpg", "photos/thumbs/ph_office_complex_blue.jpg", "photos/thumbs/ph_office_facade_modern.jpg", "photos/thumbs/ph_office_tower_glass.jpg", "photos/thumbs/ph_offshore_helicopter.jpg", "photos/thumbs/ph_offshore_rigs_horizon.jpg", "photos/thumbs/ph_offshore_vessels_gulf.jpg", "photos/thumbs/ph_offshore_wind_farm.jpg", "photos/thumbs/ph_offshore_wind_harbour.jpg", "photos/thumbs/ph_offshore_wind_row.jpg", "photos/thumbs/ph_oil_tanker_liverpool.jpg", "photos/thumbs/ph_old_library_oxford.jpg", "photos/thumbs/ph_old_valves_pipes.jpg", "photos/thumbs/ph_osv_green_vessel.jpg", "photos/thumbs/ph_osv_orange_port.jpg", "photos/thumbs/ph_osv_red_bow.jpg", "photos/thumbs/ph_pine_forest_winter.jpg", "photos/thumbs/ph_pipeline_pipes_site.jpg", "photos/thumbs/ph_platform_flare_north_sea.jpg", "photos/thumbs/ph_power_line_1150kv.jpg", "photos/thumbs/ph_power_line_750kv.jpg", "photos/thumbs/ph_power_line_mountains.jpg", "photos/thumbs/ph_power_plant_cooling_towers.jpg", "photos/thumbs/ph_power_plant_four_chimneys.jpg", "photos/thumbs/ph_power_plant_sunset_reservoir.jpg", "photos/thumbs/ph_power_pylon_forest_clearing.jpg", "photos/thumbs/ph_pressure_gauge.jpg", "photos/thumbs/ph_prirazlomnaya_platform.jpg", "photos/thumbs/ph_product_tanker_port.jpg", "photos/thumbs/ph_product_tanker_sea.jpg", "photos/thumbs/ph_product_terminal_night.jpg", "photos/thumbs/ph_psv_blue_narrows.jpg", "photos/thumbs/ph_pumpjack_baku_city.jpg", "photos/thumbs/ph_pumpjack_green_fence.jpg", "photos/thumbs/ph_pumpjack_gulf_coast.jpg", "photos/thumbs/ph_pumpjack_venezuela.jpg", "photos/thumbs/ph_pumpjack_wind_turbines.jpg", "photos/thumbs/ph_pumpjack_winter_field.jpg", "photos/thumbs/ph_pumpjacks_crop_field.jpg", "photos/thumbs/ph_pumpjacks_desert_turkmenistan.jpg", "photos/thumbs/ph_pumpjacks_sunset_california.jpg", "photos/thumbs/ph_rail_tank_car.jpg", "photos/thumbs/ph_reading_room_arches.jpg", "photos/thumbs/ph_reading_room_round_table.jpg", "photos/thumbs/ph_refinery_altona.jpg", "photos/thumbs/ph_refinery_cooling_towers.jpg", "photos/thumbs/ph_refinery_dusk_river.jpg", "photos/thumbs/ph_refinery_mountains.jpg", "photos/thumbs/ph_refinery_railway.jpg", "photos/thumbs/ph_refinery_storage_tank.jpg", "photos/thumbs/ph_reindeer_svalbard_tundra.jpg", "photos/thumbs/ph_research_lab_building.jpg", "photos/thumbs/ph_samara_volga_embankment.jpg", "photos/thumbs/ph_sayan_mountain_tundra.jpg", "photos/thumbs/ph_sayan_taiga_lake.jpg", "photos/thumbs/ph_semisub_rigs_port.jpg", "photos/thumbs/ph_server_rack_cables.jpg", "photos/thumbs/ph_server_racks_blue.jpg", "photos/thumbs/ph_siberian_taiga.jpg", "photos/thumbs/ph_small_hydro_dam.jpg", "photos/thumbs/ph_small_product_tanker.jpg", "photos/thumbs/ph_solar_flower_closeup.jpg", "photos/thumbs/ph_solar_tower_ps20.jpg", "photos/thumbs/ph_substation_building.jpg", "photos/thumbs/ph_substation_city.jpg", "photos/thumbs/ph_substation_pylons.jpg", "photos/thumbs/ph_substation_transformer.jpg", "photos/thumbs/ph_supply_vessel_norway.jpg", "photos/thumbs/ph_svalbard_tundra.jpg", "photos/thumbs/ph_tanker_fuel_depot.jpg", "photos/thumbs/ph_tanker_refinery_terminal.jpg", "photos/thumbs/ph_thermal_plant_chimney.jpg", "photos/thumbs/ph_tower_crane_building.jpg", "photos/thumbs/ph_trans_alaska_pipeline.jpg", "photos/thumbs/ph_tundra_moss.jpg", "photos/thumbs/ph_valves_colored_handwheels.jpg", "photos/thumbs/ph_valves_green_pipes.jpg", "photos/thumbs/ph_vibroseis_truck_snow.jpg", "photos/thumbs/ph_vung_tau_aerial.jpg", "photos/thumbs/ph_vung_tau_bay.jpg", "photos/thumbs/ph_wastewater_plant.jpg", "photos/thumbs/ph_wastewater_tanks.jpg", "photos/thumbs/ph_wellhead_christmas_tree.jpg", "photos/thumbs/ph_wind_farm_hills.jpg", "photos/thumbs/ph_wind_farm_power_lines.jpg", "photos/thumbs/ph_wind_farm_texas.jpg", "photos/thumbs/ph_wind_turbines_aerial.jpg", "runtime/app-483c7ec4c1.zip", "runtime/files.json", "runtime/pdf-bridge.js", "runtime/pyodide/hashlib-1.0.0.zip", "runtime/pyodide/lzma-1.0.0.zip", "runtime/pyodide/openssl-1.1.1n.zip", "runtime/pyodide/pyodide-lock.json", "runtime/pyodide/pyodide.asm.js", "runtime/pyodide/pyodide.asm.wasm", "runtime/pyodide/pyodide.js", "runtime/pyodide/python_stdlib.zip", "runtime/pyodide/ssl-1.0.0.zip", "runtime/site-9dc7653c5d.zip", "runtime/worker.js", "vendor/pdfium.js", "vendor/pdfium.wasm", "vendor/pptx-renderer.min.js"];
const SCOPE = new URL('./', self.location.href).pathname;
const KNOWN = new Set(FILES.map(f => SCOPE + f));
const PHOTOS = 'zn-photos-1';                 // фото библиотеки, выбранные хоть раз

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // по одному файлу: на медленной сети большой addAll легко обрывается целиком
    for (const f of FILES) {
      if (await c.match(f)) continue;
      try { await c.add(new Request(f, {cache: 'reload'})); } catch (e) { /* догрузится при запросе */ }
    }
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('zn-slides-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* встроенная модель ИИ: движку нужен общий с ней кусок памяти (SharedArrayBuffer), а браузер даёт его
   только «изолированной» странице (заголовки COOP/COEP). Включается, когда выбрана встроенная модель. */
let ISO = null;
async function isolated() {
  if (ISO === null) ISO = !!(await (await caches.open('zn-flags')).match('isolate'));
  return ISO;
}
function withIso(r) {
  if (!r || !r.status || r.type === 'opaque' || r.type === 'opaqueredirect') return r;
  const h = new Headers(r.headers);
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(r.body, {status: r.status, statusText: r.statusText, headers: h});
}

self.addEventListener('message', ev => {
  if (ev.data === 'skipWaiting') self.skipWaiting();
  if (ev.data === 'isolate-on' || ev.data === 'isolate-off') {
    ISO = ev.data === 'isolate-on';
    ev.waitUntil(caches.open('zn-flags').then(c => ISO ? c.put('isolate', new Response('1')) : c.delete('isolate'))
      .then(() => ev.source && ev.source.postMessage('isolate-ok')));
  }
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // модель ИИ на компьютере (через «Конструктор для телефона») — всегда по сети
  if (url.pathname.startsWith(SCOPE + 'ai/')) return;
  ev.respondWith((async () => {
    const r = await answer(req, url);
    return (await isolated()) ? withIso(r) : r;
  })());
});

async function answer(req, url) {
  const c = await caches.open(CACHE);
  const key = url.pathname.endsWith('/') ? new Request(url.pathname + 'index.html') : req;
  const hit = await c.match(key, {ignoreSearch: true}) || (url.pathname.startsWith(SCOPE + 'photos/')
    ? await (await caches.open(PHOTOS)).match(key, {ignoreSearch: true}) : null);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    // библиотеки по требованию (встроенная модель ИИ) — сохраняются при первом использовании
    if (r.ok && r.type === 'basic' && (KNOWN.has(url.pathname) || url.pathname.startsWith(SCOPE + 'vendor/'))) c.put(key, r.clone());
    // фото библиотеки — в отдельном хранилище: оно не очищается при обновлении конструктора
    else if (r.ok && r.type === 'basic' && url.pathname.startsWith(SCOPE + 'photos/')) (await caches.open(PHOTOS)).put(key, r.clone());
    return r;
  } catch (e) {
    return new Response('Нет сети, а этот файл ещё не сохранён в телефоне.', {status: 503,
      headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  }
}
