/* sw.js — работа без сети: все файлы конструктора сохраняются в телефоне при первом открытии.
 * Новая версия на сервере → новые файлы скачиваются в фоне, страница предлагает обновиться. */
'use strict';
const BUILD = '1.8-a954e296c9';
const CACHE = 'zn-slides-' + BUILD;
const FILES = [["css/app.css", "13efbc492e"], ["icons/apple-touch-icon.png", "416116d161"], ["icons/icon-192.png", "799dabaeb1"], ["icons/icon-512.png", "4aaa362279"], ["icons/icon-maskable-512.png", "77b7728b71"], ["icons/icon.svg", "bf16ea9571"], ["index.html", "afe7da6b91"], ["js/account.js", "81c4315c6c"], ["js/chart.js", "842f8772f0"], ["js/check.js", "d37e2f6b96"], ["js/core.js", "c938b2fbb4"], ["js/editor.js", "6dc6a06efe"], ["js/engine.js", "0286bb48a7"], ["js/extras.js", "3c35b8846e"], ["js/llm-worker.js", "9f526703d5"], ["js/local-llm.js", "9976b9f57f"], ["js/main.js", "cbeec42ebd"], ["js/materials.js", "1d380db053"], ["js/more.js", "00f8707c1c"], ["js/pictures.js", "2a80b51ec6"], ["js/plan.js", "3e0d0abb30"], ["js/shared.js", "e8fd6fd0d1"], ["js/slides-view.js", "aed4551f6b"], ["manifest.webmanifest", "bc58d3aa6c"], ["photos/catalog.json", "2c4da43b83"], ["photos/thumbs/ph_ahts_red_vessel.jpg", "0c752bfe9a"], ["photos/thumbs/ph_arctic_iceberg.jpg", "30f3425017"], ["photos/thumbs/ph_aswan_dam.jpg", "1db76e1d2b"], ["photos/thumbs/ph_bac_lieu_wind_farm.jpg", "ecf4f1e97b"], ["photos/thumbs/ph_baku_black_city_derricks.jpg", "58159e8976"], ["photos/thumbs/ph_baku_pumpjack_field.jpg", "9922eb12c3"], ["photos/thumbs/ph_battery_storage_containers.jpg", "1cc8ada584"], ["photos/thumbs/ph_biogas_farm.jpg", "bc87e6638b"], ["photos/thumbs/ph_boardroom_oval_table.jpg", "9c10bfe69c"], ["photos/thumbs/ph_cng_filling_station.jpg", "e4c0601551"], ["photos/thumbs/ph_coal_power_plant_java.jpg", "c777d5dd34"], ["photos/thumbs/ph_coastal_oil_depot.jpg", "f11ac83c7b"], ["photos/thumbs/ph_combined_cycle_plant.jpg", "3fb8929951"], ["photos/thumbs/ph_construction_site_crane.jpg", "59b0e0b632"], ["photos/thumbs/ph_container_cranes_port.jpg", "c876b3ed3d"], ["photos/thumbs/ph_container_cranes_silhouette.jpg", "c0fa3efcdf"], ["photos/thumbs/ph_container_feeder_ship.jpg", "84dc2b8780"], ["photos/thumbs/ph_container_rail_terminal.jpg", "3cc02428cf"], ["photos/thumbs/ph_container_ship_cranes.jpg", "7aa61dd5aa"], ["photos/thumbs/ph_container_terminal_hamburg.jpg", "4ecd2336d3"], ["photos/thumbs/ph_container_terminal_hamburg_2.jpg", "0c0ccc97c2"], ["photos/thumbs/ph_cooling_tower_aerial.jpg", "5df1be225a"], ["photos/thumbs/ph_cooling_tower_windmill.jpg", "9be2f74669"], ["photos/thumbs/ph_cooling_towers_green.jpg", "e0bfa3d848"], ["photos/thumbs/ph_cooling_towers_steam.jpg", "59dc1eb511"], ["photos/thumbs/ph_crude_tank_farm.jpg", "09ea4f8cb6"], ["photos/thumbs/ph_drilling_rig_silhouette.jpg", "566761652e"], ["photos/thumbs/ph_drillship_docked.jpg", "d2e9a65053"], ["photos/thumbs/ph_drillships_las_palmas.jpg", "b86a6fa261"], ["photos/thumbs/ph_earth_from_space_arctic.jpg", "8da5a45687"], ["photos/thumbs/ph_empty_meeting_room.jpg", "75bfd197e0"], ["photos/thumbs/ph_filling_station_morocco.jpg", "1116998b28"], ["photos/thumbs/ph_fire_engine_snow.jpg", "b8afb60217"], ["photos/thumbs/ph_fire_engine_zil130.jpg", "81cac1ef50"], ["photos/thumbs/ph_fire_truck_zil.jpg", "3016fcbf7b"], ["photos/thumbs/ph_flare_chemical_plant.jpg", "43daa70e67"], ["photos/thumbs/ph_flare_stack_storm.jpg", "24b8b428cf"], ["photos/thumbs/ph_flare_stack_tower.jpg", "307208bc41"], ["photos/thumbs/ph_fuel_tanker_truck.jpg", "c0fa5a35e1"], ["photos/thumbs/ph_gas_compressor_station.jpg", "af8f2df06d"], ["photos/thumbs/ph_gas_pipe_valve.jpg", "bda2802666"], ["photos/thumbs/ph_gas_processing_plant.jpg", "4524a52802"], ["photos/thumbs/ph_glen_canyon_dam.jpg", "c18fe0606e"], ["photos/thumbs/ph_havana_harbour.jpg", "8676ac3d65"], ["photos/thumbs/ph_helicopter_over_sea_platform.jpg", "bbe15bec43"], ["photos/thumbs/ph_high_rise_construction.jpg", "b26fcc56f8"], ["photos/thumbs/ph_highway_construction.jpg", "c27215d249"], ["photos/thumbs/ph_hoover_dam_powerhouse.jpg", "89f8ccc2dd"], ["photos/thumbs/ph_hoover_dam_towers.jpg", "f14b91d5bb"], ["photos/thumbs/ph_hydro_station_pipes.jpg", "047bee6fbf"], ["photos/thumbs/ph_hydrogen_refuelling.jpg", "c621183173"], ["photos/thumbs/ph_hydrogen_station_fukuoka.jpg", "41d9080a48"], ["photos/thumbs/ph_jackup_rig_harbour.jpg", "828168cbca"], ["photos/thumbs/ph_lab_bottle_clear.jpg", "d925842761"], ["photos/thumbs/ph_lab_glassware_colors.jpg", "41087da578"], ["photos/thumbs/ph_lab_heating_block.jpg", "5d849d2793"], ["photos/thumbs/ph_lapland_forest.jpg", "2015c9514e"], ["photos/thumbs/ph_library_reading_room.jpg", "2852228b2d"], ["photos/thumbs/ph_lng_carrier.jpg", "2342737709"], ["photos/thumbs/ph_lng_carrier_construction.jpg", "e8acae0a85"], ["photos/thumbs/ph_lng_carrier_hammerfest.jpg", "37aa99187d"], ["photos/thumbs/ph_lng_carrier_sea.jpg", "c7aa0d4f86"], ["photos/thumbs/ph_mobile_crane_bridge_site.jpg", "660b1ce381"], ["photos/thumbs/ph_moscow_city_2025.jpg", "0c0e7b8396"], ["photos/thumbs/ph_moscow_city_day.jpg", "5c51774a52"], ["photos/thumbs/ph_moscow_city_moon.jpg", "45b0d8e762"], ["photos/thumbs/ph_moscow_city_night.jpg", "fed291967c"], ["photos/thumbs/ph_moscow_city_sparrow_hills.jpg", "eabc9ed0e9"], ["photos/thumbs/ph_moscow_exchange.jpg", "442d21f81b"], ["photos/thumbs/ph_north_sea_platform_deck.jpg", "a3eb3f4a46"], ["photos/thumbs/ph_nuclear_cooling_tower.jpg", "11913a5235"], ["photos/thumbs/ph_office_buildings_harbour.jpg", "10ad94e871"], ["photos/thumbs/ph_office_complex_blue.jpg", "85afab390e"], ["photos/thumbs/ph_office_facade_modern.jpg", "bae338b6c3"], ["photos/thumbs/ph_office_tower_glass.jpg", "ec9ba8a37e"], ["photos/thumbs/ph_offshore_helicopter.jpg", "092c8d4a85"], ["photos/thumbs/ph_offshore_rigs_horizon.jpg", "b0c96062e5"], ["photos/thumbs/ph_offshore_vessels_gulf.jpg", "6a747831aa"], ["photos/thumbs/ph_offshore_wind_farm.jpg", "57af15b5e0"], ["photos/thumbs/ph_offshore_wind_harbour.jpg", "df5a561ca9"], ["photos/thumbs/ph_offshore_wind_row.jpg", "8bad65c007"], ["photos/thumbs/ph_oil_tanker_liverpool.jpg", "e94781ec6e"], ["photos/thumbs/ph_old_library_oxford.jpg", "c331a90cdc"], ["photos/thumbs/ph_old_valves_pipes.jpg", "c4d40f5a4c"], ["photos/thumbs/ph_osv_green_vessel.jpg", "2836b4ea0d"], ["photos/thumbs/ph_osv_orange_port.jpg", "a8f4f9d984"], ["photos/thumbs/ph_osv_red_bow.jpg", "3b1fcd7e15"], ["photos/thumbs/ph_pine_forest_winter.jpg", "bda4929fad"], ["photos/thumbs/ph_pipeline_pipes_site.jpg", "a91182e942"], ["photos/thumbs/ph_platform_flare_north_sea.jpg", "6a60fa763f"], ["photos/thumbs/ph_power_line_1150kv.jpg", "824287075c"], ["photos/thumbs/ph_power_line_750kv.jpg", "fe6f786fde"], ["photos/thumbs/ph_power_line_mountains.jpg", "d612c650e6"], ["photos/thumbs/ph_power_plant_cooling_towers.jpg", "3c651ffa66"], ["photos/thumbs/ph_power_plant_four_chimneys.jpg", "f6d4508f5a"], ["photos/thumbs/ph_power_plant_sunset_reservoir.jpg", "1486337e1b"], ["photos/thumbs/ph_power_pylon_forest_clearing.jpg", "4084864dce"], ["photos/thumbs/ph_pressure_gauge.jpg", "e963e7ae89"], ["photos/thumbs/ph_prirazlomnaya_platform.jpg", "3c1e445746"], ["photos/thumbs/ph_product_tanker_port.jpg", "3d44f41715"], ["photos/thumbs/ph_product_tanker_sea.jpg", "e9c88d109f"], ["photos/thumbs/ph_product_terminal_night.jpg", "c071f94944"], ["photos/thumbs/ph_psv_blue_narrows.jpg", "194b2486cf"], ["photos/thumbs/ph_pumpjack_baku_city.jpg", "272cff66ae"], ["photos/thumbs/ph_pumpjack_green_fence.jpg", "6714515958"], ["photos/thumbs/ph_pumpjack_gulf_coast.jpg", "cf4f3a3981"], ["photos/thumbs/ph_pumpjack_venezuela.jpg", "2625421188"], ["photos/thumbs/ph_pumpjack_wind_turbines.jpg", "25f8998c5f"], ["photos/thumbs/ph_pumpjack_winter_field.jpg", "ddcbaadcee"], ["photos/thumbs/ph_pumpjacks_crop_field.jpg", "f240dbc7e4"], ["photos/thumbs/ph_pumpjacks_desert_turkmenistan.jpg", "0ffc5abf2a"], ["photos/thumbs/ph_pumpjacks_sunset_california.jpg", "46aab5994e"], ["photos/thumbs/ph_rail_tank_car.jpg", "ced647d215"], ["photos/thumbs/ph_reading_room_arches.jpg", "507178ccbd"], ["photos/thumbs/ph_reading_room_round_table.jpg", "1c0c325bfe"], ["photos/thumbs/ph_refinery_altona.jpg", "ef88269c17"], ["photos/thumbs/ph_refinery_cooling_towers.jpg", "3cdef00ff6"], ["photos/thumbs/ph_refinery_dusk_river.jpg", "bcf7002f53"], ["photos/thumbs/ph_refinery_mountains.jpg", "96f916a9bc"], ["photos/thumbs/ph_refinery_railway.jpg", "7b1615f535"], ["photos/thumbs/ph_refinery_storage_tank.jpg", "a0b0125138"], ["photos/thumbs/ph_reindeer_svalbard_tundra.jpg", "6a1722f8e8"], ["photos/thumbs/ph_research_lab_building.jpg", "a455870edc"], ["photos/thumbs/ph_samara_volga_embankment.jpg", "e962fbb253"], ["photos/thumbs/ph_sayan_mountain_tundra.jpg", "09681a6ac0"], ["photos/thumbs/ph_sayan_taiga_lake.jpg", "e9d4a6af6b"], ["photos/thumbs/ph_semisub_rigs_port.jpg", "8c6f2fe31c"], ["photos/thumbs/ph_server_rack_cables.jpg", "ba3cd50812"], ["photos/thumbs/ph_server_racks_blue.jpg", "c68bd68180"], ["photos/thumbs/ph_siberian_taiga.jpg", "636786be6c"], ["photos/thumbs/ph_small_hydro_dam.jpg", "9ff1804e65"], ["photos/thumbs/ph_small_product_tanker.jpg", "cf89ce4802"], ["photos/thumbs/ph_solar_flower_closeup.jpg", "39bf17ac08"], ["photos/thumbs/ph_solar_tower_ps20.jpg", "005b5ad0c4"], ["photos/thumbs/ph_substation_building.jpg", "ea37b67f43"], ["photos/thumbs/ph_substation_city.jpg", "3eacf7a993"], ["photos/thumbs/ph_substation_pylons.jpg", "bcb4ee04ce"], ["photos/thumbs/ph_substation_transformer.jpg", "6893b7c3db"], ["photos/thumbs/ph_supply_vessel_norway.jpg", "881c01e392"], ["photos/thumbs/ph_svalbard_tundra.jpg", "953aca135a"], ["photos/thumbs/ph_tanker_fuel_depot.jpg", "5a69872829"], ["photos/thumbs/ph_tanker_refinery_terminal.jpg", "c0aeb9589f"], ["photos/thumbs/ph_thermal_plant_chimney.jpg", "3ec79d0076"], ["photos/thumbs/ph_tower_crane_building.jpg", "2cc0661d62"], ["photos/thumbs/ph_trans_alaska_pipeline.jpg", "b13f187b5d"], ["photos/thumbs/ph_tundra_moss.jpg", "d7ef098d70"], ["photos/thumbs/ph_valves_colored_handwheels.jpg", "94b08ccc6e"], ["photos/thumbs/ph_valves_green_pipes.jpg", "27e2d5093b"], ["photos/thumbs/ph_vibroseis_truck_snow.jpg", "3e6da45b6d"], ["photos/thumbs/ph_vung_tau_aerial.jpg", "a0d15ce103"], ["photos/thumbs/ph_vung_tau_bay.jpg", "4947452095"], ["photos/thumbs/ph_wastewater_plant.jpg", "e9ae246316"], ["photos/thumbs/ph_wastewater_tanks.jpg", "98a3b48996"], ["photos/thumbs/ph_wellhead_christmas_tree.jpg", "7ac66dd73c"], ["photos/thumbs/ph_wind_farm_hills.jpg", "601d203593"], ["photos/thumbs/ph_wind_farm_power_lines.jpg", "4139294529"], ["photos/thumbs/ph_wind_farm_texas.jpg", "860573c985"], ["photos/thumbs/ph_wind_turbines_aerial.jpg", "fe3826489f"], ["runtime/app-27221f7fd0.zip", "27221f7fd0"], ["runtime/files.json", "d554763461"], ["runtime/icons-2e3b86e33a.zip", "2e3b86e33a"], ["runtime/pdf-bridge.js", "6e540c5886"], ["runtime/pyodide/hashlib-1.0.0.zip", "96545d5e07"], ["runtime/pyodide/lzma-1.0.0.zip", "4bd809931c"], ["runtime/pyodide/openssl-1.1.1n.zip", "d3a7f50196"], ["runtime/pyodide/pyodide-lock.json", "6526dae570"], ["runtime/pyodide/pyodide.asm.js", "512042dfdd"], ["runtime/pyodide/pyodide.asm.wasm", "aa920641c0"], ["runtime/pyodide/pyodide.js", "b9cb64a73c"], ["runtime/pyodide/python_stdlib.zip", "52866039fa"], ["runtime/pyodide/sqlite3-1.0.0.zip", "49dad33820"], ["runtime/pyodide/ssl-1.0.0.zip", "89b210fdbd"], ["runtime/site-9dc7653c5d.zip", "9dc7653c5d"], ["runtime/worker.js", "a132264507"], ["vendor/pdfium.js", "b46a78bd47"], ["vendor/pdfium.wasm", "5e4cd023c3"], ["vendor/pptx-renderer.min.js", "8c91870a58"]];                      // [путь, хэш содержимого]
const SCOPE = new URL('./', self.location.href).pathname;
const KNOWN = new Set(FILES.map(([f]) => SCOPE + f));
const PHOTOS = 'zn-photos-1';                 // фото библиотеки, выбранные хоть раз

/* хэш содержимого — как в tools/build_web.py: первые 10 знаков SHA-256 */
async function digest(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(d.slice(0, 5), b => b.toString(16).padStart(2, '0')).join('');
}
/* файл из прежней версии с тем же содержимым — переносится, а не скачивается заново */
async function fromOld(olds, f, hash) {
  for (const o of olds) {
    const r = await o.match(f);
    if (!r) continue;
    try {
      const buf = await r.arrayBuffer();
      if (await digest(buf) === hash) return new Response(buf, {status: 200, headers: r.headers});
    } catch (e) { /* проверим следующий */ }
  }
  return null;
}

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const olds = [];
    for (const k of await caches.keys()) if (k.startsWith('zn-slides-') && k !== CACHE) olds.push(await caches.open(k));
    // по одному файлу: на медленной сети большой addAll легко обрывается целиком
    for (const [f, hash] of FILES) {
      if (await c.match(f)) continue;
      try {
        const old = olds.length ? await fromOld(olds, f, hash) : null;
        if (old) await c.put(f, old);
        else await c.add(new Request(f, {cache: 'reload'}));
      } catch (e) { /* догрузится при запросе */ }
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
