'use strict';
const $ = id => document.getElementById(id);
const assetRevision = new URL(document.currentScript.src).searchParams.get('v');
const assetUrl = path => assetRevision ? `${path}?v=${encodeURIComponent(assetRevision)}` : path;
let data, map, routeLayer, networkLayer, crossingLayer, bailoutLayer, endLayer, mileLayer;
let selectedRoute = new URLSearchParams(location.search).get('route');
let chosen = ['overview','creek','ridge','parking','tour'].includes(selectedRoute) ? selectedRoute : 'overview';
let gpsWatch = null, gpsMarker = null, gpsAccuracy = null, satelliteOn = false;
const milesBetween = (a,b) => {const rad=x=>x*Math.PI/180, lat=rad(b[1]-a[1]),lon=rad(b[0]-a[0]);return 3958.7613*2*Math.asin(Math.sqrt(Math.sin(lat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(lon/2)**2));};
const latlng = c => [c[1],c[0]];
const notice = text => {$('toast').textContent=text;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),3500);};
const icon = (className, text='',size=[28,28]) => L.divIcon({className:'',html:`<div class="${className}">${text}</div>`,iconSize:size,iconAnchor:[size[0]/2,size[1]/2]});

function renderRoute(fit=true){
  const r=data.routes[chosen];
  routeLayer.clearLayers();crossingLayer.clearLayers();bailoutLayer.clearLayers();endLayer.clearLayers();mileLayer.clearLayers();
  const routeBounds=L.latLngBounds([]);
  if(r.legs){
    r.legs.forEach(leg=>leg.parts.forEach(part=>{
      const points=part.map(latlng);L.polyline(points,{color:'#fffef8',weight:10,opacity:.92}).addTo(routeLayer);
      const line=L.polyline(points,{color:leg.color,weight:5,opacity:1}).bindPopup(`<strong>${leg.label}</strong>${leg.miles.toFixed(1)} miles`);line.addTo(routeLayer);routeBounds.extend(line.getBounds());
    }));
  }else{
    const points=r.coordinates.map(latlng);L.polyline(points,{color:'#fffef8',weight:9,opacity:.9}).addTo(routeLayer);
    const line=L.polyline(points,{color:'#7138ab',weight:5,opacity:1}).addTo(routeLayer);routeBounds.extend(line.getBounds());
  }
  const overview=chosen==='overview', tour=chosen==='tour', park=chosen==='ridge', creek=chosen==='creek', pickup=chosen==='parking';
  $('route-sketch').src=assetUrl(overview?'route-sketch.svg':`${chosen}-sketch.svg`);
  const total=r.total_miles ?? r.round_trip_miles;
  $('distance').textContent=total.toFixed(1);
  $('distance-label').textContent=overview?'connected trail miles':pickup?'miles one way to pickup':'miles including retracing';
  const low=(total/2+.5).toFixed(1),high=(total/2+1).toFixed(1);
  $('time').textContent=overview?'—':`${low}–${high}`;
  $('time-label').textContent=overview?'choose a route for time':'hours, estimated with stops';
  $('crossing-count').textContent=r.crossings.length;
  $('crossing-label').textContent=overview?'mapped crossing candidates':pickup?'mapped crossing sites before pickup':'mapped crossing sites on route';
  $('network-miles').textContent=data.network_miles.toFixed(1);
  $('plan-title').textContent=overview?'Broader trail network':pickup?'North road pickup · one way':r.label;
  $('plan-description').textContent=overview?'The colors distinguish the City’s three mapped trail systems. This is trail inventory, not one prescribed hike. Choose a route above to see its walking distance and return plan.':tour?'A 15.5-mile Lakewood-start loop with the north access as a turnaround, three St. Edward’s branch excursions, and two Bull Creek branch excursions. Every side excursion retraces to its junction; this is not a continuous nonrepeating circuit.':park?`Walk up through Forest Ridge, make a ${r.park_circuit_miles.toFixed(1)}-mile circuit on two distinct St. Edward’s paths, then retrace the Forest Ridge approach to Lakewood. The park section is a loop; the whole walk shares its approach and return.`:creek?`Follow the mapped Bull Creek Greenbelt creekside branch about ${r.creek_out_miles.toFixed(1)} mile from Lakewood to its last connected point. A ${r.discontinuity.gap_meters.toFixed(1)}-meter break separates it from the next mapped trail segment; passage has not been checked. Return on the shared trail with a short alternate path in the lower park. Most of this walk is retraced.`:'Walk 5.0 miles one way from Lakewood to the farthest City-mapped St. Edward’s north-road access. Arrange a ride at the far end before starting; the marked access has not been checked for a safe pickup spot. This route does not return to Lakewood.';
  $('steps').innerHTML=overview
    ? r.legs.map((leg,i)=>`<div class="step"><b><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${leg.color};margin-right:4px"></i>Map ${i+1}</b><span><strong>City lists ${leg.miles.toFixed(1)} mi</strong> · ${leg.label}</span></div>`).join('')
    : r.legs
    ? (()=>{let miles=0;return r.legs.map(leg=>{miles+=leg.miles;return `<div class="step"><b>${miles.toFixed(1)} mi</b><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${leg.color};margin-right:6px"></i>${leg.label} · ${leg.miles.toFixed(1)} mi</span></div>`;}).join('');})()
    : `<div class="step"><b>Start</b><span>Bull Creek District Park, Lakewood Drive. Trail-start pin is approximate.</span></div><div class="step"><b>~0.7 mi</b><span>Crossing candidate near Forest Ridge. Follow the preserve route uphill.</span></div><div class="step"><b>~3.7 mi</b><span>Reach the ridge connection into St. Edward’s.</span></div><div class="step"><b>~4.1 mi</b><span>Second crossing candidate in St. Edward’s.</span></div><div class="step"><b>~4.2 mi</b><span>City-mapped south roadside access: a bailout point, not a verified pickup bay.</span></div><div class="step"><b>${r.one_way_miles.toFixed(1)} mi</b><span>North roadside access. Arrange pickup here; the map does not confirm a safe waiting area.</span></div>`;
  if(r.discontinuity)$('steps').insertAdjacentHTML('beforeend',`<div class="step"><b>Map gap</b><span>The City line stops about ${r.discontinuity.gap_meters.toFixed(1)} m before the next mapped segment. The route turns back here; no passage is assumed.</span></div>`);
  $('crossings').replaceChildren();
  $('crossing-intro').textContent=r.crossings.length?'These pins mark intersections of the City trail line and the mapped creek channel. Their crossing structures, depth and current have not been field checked.':'This route has no mapped intersection with the main Bull Creek channel. Smaller drainages, wet spots and current conditions have not been surveyed.';
  r.crossings.forEach((c,i)=>{
    const m=L.marker(latlng(c.coordinates),{icon:icon('ford-marker','≈')}).addTo(crossingLayer);
    m.bindPopup(`<strong>${i+1}. ${c.title}</strong>About mile ${c.mile.toFixed(1)} ${tour?'first reached on the tour':'outbound'}.<small>${c.status}. Depth and current are not measured here.</small>`);
    const card=document.createElement('article');card.className='crossing-card';
    const crossingText=overview?'These are candidates on the northbound connection, not a complete inventory of every crossing in the overview. No live depth or current reading is available at either pin.':pickup?'This point is reached before the planned pickup. No live depth or current reading is available here.':'This mile marks the first encounter. The loop may revisit this site; no live depth or current reading is available here.';
    card.innerHTML=`<div class="mile">${i+1} / ABOUT MILE ${c.mile.toFixed(1)} ${pickup?'ON THE ONE-WAY WALK':'FIRST REACHED ON ROUTE'}</div><h3>${c.title}</h3><div class="status">Possible creek crossing · structure unverified</div><p>${crossingText}</p><button type="button">Show crossing on map ↑</button>`;
    card.querySelector('button').addEventListener('click',()=>{map.setView(latlng(c.coordinates),17);m.openPopup();$('map').scrollIntoView({behavior:'smooth',block:'center'});});
    $('crossings').appendChild(card);
  });
  if(!r.crossings.length)$('crossings').innerHTML='<p class="small">No crossing pin appears for this route; this is not a dry-trail guarantee.</p>';
  $('turnback-note').style.display=r.crossings.length?'':'none';
  if(r.crossings.length)$('turnback-note').querySelector('strong').textContent=pickup?'The route ends at the north road; arrange pickup first.':'You may encounter this crossing again on your return.';
  $('bailouts').replaceChildren();
  r.bailouts.forEach((b,i)=>{
    const isStart=b.id==='lakewood-start';
    const m=L.marker(latlng(b.coordinates),{icon:icon('bailout-marker',isStart?'↩':'R')}).addTo(bailoutLayer);
    m.bindPopup(`<strong>${b.title}</strong>About mile ${b.mile.toFixed(1)} from Lakewood.<small>${b.note}</small>`);
    const card=document.createElement('article');card.className='bailout-card';
    const maps=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.coordinates[1]},${b.coordinates[0]}`)}`;
    const uber='https://m.uber.com/ul/?action=setPickup&pickup=my_location';
    const crossingWarning=isStart
      ? r.crossings.length?'Return here if the next crossing is not passable.':'Start and finish here.'
      : 'This exit lies after the second mapped crossing candidate; it does not bypass high water.';
    card.innerHTML=`<div class="mile">${i+1} / ABOUT MILE ${b.mile.toFixed(1)} ${tour?'ON FIRST NORTHBOUND PASS':pickup?'ON ONE-WAY WALK':'FROM START'}</div><h3>${b.title}</h3><p>${crossingWarning} ${b.note}</p><div class="bailout-actions"><a href="${maps}" target="_blank" rel="noopener">Show access pin ↗</a><a href="${uber}" target="_blank" rel="noopener">Open Uber ↗</a><button type="button">Show on map ↑</button></div>`;
    card.querySelector('button').addEventListener('click',()=>{map.setView(latlng(b.coordinates),17);m.openPopup();$('map').scrollIntoView({behavior:'smooth',block:'center'});});
    $('bailouts').appendChild(card);
  });
  if(!overview)(pickup?[[r.coordinates[0],'Start · Lakewood Drive'],[r.coordinates.at(-1),'Pickup · north roadside access']]:[[r.coordinates[0],'Start and finish · Lakewood Drive']]).forEach(([c,label])=>L.marker(latlng(c),{icon:icon('end-marker','',[22,22])}).bindPopup(`<strong>${label}</strong>${c[1].toFixed(5)}, ${c[0].toFixed(5)}<small>Mapped trail point; parking approach is not surveyed.</small>`).addTo(endLayer));
  if(r.discontinuity)L.marker(latlng(r.discontinuity.at),{icon:icon('gap-marker','?',[26,26])}).bindPopup(`<strong>Mapped trail break</strong>About ${r.discontinuity.gap_meters.toFixed(1)} meters to the next City line.<small>${r.discontinuity.note}</small>`).addTo(endLayer);
  let travelled=0,next=1;
  for(let i=1;i<r.coordinates.length;i++){
    const a=r.coordinates[i-1],b=r.coordinates[i],length=milesBetween(a,b);
    while(travelled+length>=next){const t=(next-travelled)/length,c=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];L.marker(latlng(c),{icon:icon('mile-label',`${next} mi`,[39,22]),interactive:false}).addTo(mileLayer);next++;}
    travelled+=length;
  }
  if(overview)mileLayer.clearLayers();
  $('gpx').style.display=overview?'none':'';
  if(!overview)$('gpx').href=`bull-creek-${chosen}.gpx`;
  for(const key of ['overview','creek','ridge','parking','tour']){$(`route-${key}`).classList.toggle('selected',key===chosen);$(`route-${key}`).setAttribute('aria-pressed',String(key===chosen));}
  const url=new URL(location.href);url.searchParams.set('route',chosen);history.replaceState(null,'',url);
  if(fit)map.fitBounds(routeBounds,{padding:[28,28]});
}

async function start(){
  try{
    const response=await fetch(assetUrl('route-data.json'));if(!response.ok)throw new Error('Route data unavailable');data=await response.json();
    map=L.map('map',{scrollWheelZoom:false});
    const topo=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Basemap © Esri, USGS, OpenStreetMap contributors'}).addTo(map);
    const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics'});
    const hideSketch=()=>$('route-sketch').classList.add('map-ready');
    topo.on('load',hideSketch);satellite.on('load',hideSketch);
    L.geoJSON(data.creeks,{style:{color:'#2186b1',weight:3,opacity:.8},onEachFeature:(f,l)=>l.bindPopup('Bull Creek · OpenStreetMap centerline, September 2026. This line does not show current water extent.')}).addTo(map);
    networkLayer=L.geoJSON(data.network,{style:{color:'#778a70',weight:2,opacity:.65},onEachFeature:(f,l)=>l.bindPopup(f.properties.name)}).addTo(map);
    routeLayer=L.layerGroup().addTo(map);mileLayer=L.layerGroup().addTo(map);crossingLayer=L.layerGroup().addTo(map);bailoutLayer=L.layerGroup().addTo(map);endLayer=L.layerGroup().addTo(map);
    data.sources.forEach(s=>{const li=document.createElement('li');const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener';a.textContent=s.title;li.append(a,` · ${s.date}`);$('source-list').append(li);});
    for(const key of ['overview','creek','ridge','parking','tour'])$(`route-${key}`).addEventListener('click',()=>{chosen=key;renderRoute();});
    $('fit').addEventListener('click',()=>renderRoute());
    $('show-network').addEventListener('change',e=>e.target.checked?networkLayer.addTo(map):map.removeLayer(networkLayer));
    $('basemap').addEventListener('click',()=>{satelliteOn=!satelliteOn;if(satelliteOn){map.removeLayer(topo);satellite.addTo(map);}else{map.removeLayer(satellite);topo.addTo(map);} $('basemap').textContent=satelliteOn?'Topo map':'Satellite';$('basemap').setAttribute('aria-pressed',String(satelliteOn));});
    renderRoute();
  }catch(error){$('plan-description').textContent='The interactive map could not load. The trail graphic at left still shows the City trail geometry, creek, crossings and mapped access points.';$('location-note').textContent='Offline trail graphic shown. '+error.message;console.error(error);}
}

$('share').addEventListener('click',async()=>{
  const title='Bull Creek → Forest Ridge → St. Edward’s';
  try{if(navigator.share)await navigator.share({title,url:location.href});else{await navigator.clipboard.writeText(location.href);notice('Hike link copied.');}}catch(error){if(error.name!=='AbortError')notice('Copy this page’s address to share the hike.');}
});
$('locate').addEventListener('click',()=>{
  if(gpsWatch!==null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;$('locate').textContent='◎ My location';$('location-note').textContent='Location tracking stopped. Your position was not uploaded.';return;}
  if(!navigator.geolocation){notice('This browser does not support location.');return;}
  $('location-note').textContent='Waiting for location permission. Your position stays in this browser.';
  let first=true;
  gpsWatch=navigator.geolocation.watchPosition(position=>{
    const {latitude,longitude,accuracy}=position.coords,p=[latitude,longitude];
    if(gpsMarker){gpsMarker.setLatLng(p);gpsAccuracy.setLatLng(p).setRadius(accuracy);}else{gpsMarker=L.marker(p,{icon:icon('location-dot','',[18,18])}).addTo(map);gpsAccuracy=L.circle(p,{radius:accuracy,color:'#1976ed',fillOpacity:.08,weight:1}).addTo(map);}
    if(first){map.setView(p,16);first=false;}
    $('locate').textContent='■ Stop location';$('location-note').textContent=`Location accuracy about ${Math.round(accuracy)} m. Position stays in your browser; it is not a measured trail fix.`;
  },error=>{if(gpsWatch!==null)navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;$('locate').textContent='◎ My location';$('location-note').textContent=error.code===1?'Location permission was declined. You can still use the route map.':'Location is unavailable. Try again outdoors with a clear view of the sky.';},{enableHighAccuracy:true,timeout:20000,maximumAge:10000});
});
start();
