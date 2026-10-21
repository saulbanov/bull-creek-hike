'use strict';
const $ = id => document.getElementById(id);
let data, map, routeLayer, networkLayer, crossingLayer, endLayer, mileLayer;
let chosen = new URLSearchParams(location.search).get('route') === 'parking' ? 'parking' : 'ridge';
let gpsWatch = null, gpsMarker = null, gpsAccuracy = null, satelliteOn = false;
const milesBetween = (a,b) => {const rad=x=>x*Math.PI/180, lat=rad(b[1]-a[1]),lon=rad(b[0]-a[0]);return 3958.7613*2*Math.asin(Math.sqrt(Math.sin(lat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(lon/2)**2));};
const latlng = c => [c[1],c[0]];
const notice = text => {$('toast').textContent=text;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),3500);};
const icon = (className, text='',size=[28,28]) => L.divIcon({className:'',html:`<div class="${className}">${text}</div>`,iconSize:size,iconAnchor:[size[0]/2,size[1]/2]});

function renderRoute(fit=true){
  const r=data.routes[chosen];
  routeLayer.clearLayers();crossingLayer.clearLayers();endLayer.clearLayers();mileLayer.clearLayers();
  L.polyline(r.coordinates.map(latlng),{color:'#fffef8',weight:9,opacity:.9}).addTo(routeLayer);
  const line=L.polyline(r.coordinates.map(latlng),{color:'#7138ab',weight:5,opacity:1}).addTo(routeLayer);
  const round=r.round_trip_miles;
  $('distance').textContent=round.toFixed(1);
  const low=(round/2+.5).toFixed(1),high=(round/2+1).toFixed(1);
  $('time').textContent=`${low}–${high}`;
  $('crossing-count').textContent=r.crossings.length;
  $('crossing-label').textContent=r.crossings.length===1?'possible ford, each way':'possible fords, each way';
  $('plan-title').textContent=chosen==='ridge'?'Turn around on the ridge':'Continue to roadside access';
  $('plan-description').textContent=chosen==='ridge'?'Reach the St. Edward’s side of the ridge and return the same way. This skips the additional Bull Creek crossing on the descent toward the roadside access.':'Descend into St. Edward’s and continue to the City’s access point on Spicewood Springs Road. This adds a second possible Bull Creek ford before the turnaround.';
  $('steps').innerHTML=`<div class="step"><b>Start</b><span>Bull Creek District Park, Lakewood Drive. Trail-start pin is approximate.</span></div><div class="step"><b>~0.7 mi</b><span>Crossing candidate near Forest Ridge. Follow the preserve route uphill.</span></div>${chosen==='parking'?'<div class="step"><b>~3.7 mi</b><span>Reach the ridge connection into St. Edward’s.</span></div>':''}${chosen==='parking'?`<div class="step"><b>~4.1 mi</b><span>Second crossing candidate in St. Edward’s.</span></div>`:''}<div class="step"><b>${r.one_way_miles.toFixed(1)} mi</b><span>${chosen==='ridge'?'Ridge turnaround':'City roadside-access point'}. Retrace the route to Lakewood Drive.</span></div>`;
  $('crossings').replaceChildren();
  r.crossings.forEach((c,i)=>{
    const m=L.marker(latlng(c.coordinates),{icon:icon('ford-marker','≈')}).addTo(crossingLayer);
    m.bindPopup(`<strong>${i+1}. ${c.title}</strong>About mile ${c.mile.toFixed(1)} outbound.<small>${c.status}. Depth and current are not measured here.</small>`);
    const card=document.createElement('article');card.className='crossing-card';
    card.innerHTML=`<div class="mile">${i+1} / ABOUT MILE ${c.mile.toFixed(1)} OUTBOUND</div><h3>${c.title}</h3><div class="status">Possible ford · structure unverified</div><p>${chosen==='ridge'?'You encounter this location twice on the out-and-back.':'You encounter this location once outbound and again on your return.'} No live depth or current reading is available at this pin.</p><button type="button">Show crossing on map ↑</button>`;
    card.querySelector('button').addEventListener('click',()=>{map.setView(latlng(c.coordinates),17);m.openPopup();$('map').scrollIntoView({behavior:'smooth',block:'center'});});
    $('crossings').appendChild(card);
  });
  [[r.coordinates[0],'Start · Lakewood Drive'],[r.coordinates.at(-1),r.label]].forEach(([c,label])=>L.marker(latlng(c),{icon:icon('end-marker','',[22,22])}).bindPopup(`<strong>${label}</strong>${c[1].toFixed(5)}, ${c[0].toFixed(5)}<small>Mapped trail point; parking approach is not surveyed.</small>`).addTo(endLayer));
  let travelled=0,next=1;
  for(let i=1;i<r.coordinates.length;i++){
    const a=r.coordinates[i-1],b=r.coordinates[i],length=milesBetween(a,b);
    while(travelled+length>=next){const t=(next-travelled)/length,c=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];L.marker(latlng(c),{icon:icon('mile-label',`${next} mi`,[39,22]),interactive:false}).addTo(mileLayer);next++;}
    travelled+=length;
  }
  $('gpx').href=`bull-creek-${chosen}.gpx`;
  for(const key of ['ridge','parking']){$(`route-${key}`).classList.toggle('selected',key===chosen);$(`route-${key}`).setAttribute('aria-pressed',String(key===chosen));}
  const url=new URL(location.href);url.searchParams.set('route',chosen);history.replaceState(null,'',url);
  if(fit)map.fitBounds(line.getBounds(),{padding:[28,28]});
}

async function start(){
  try{
    const response=await fetch('route-data.json');if(!response.ok)throw new Error('Route data unavailable');data=await response.json();
    map=L.map('map',{scrollWheelZoom:false});
    const topo=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Basemap © Esri, USGS, OpenStreetMap contributors'}).addTo(map);
    const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics'});
    L.geoJSON(data.creeks,{style:{color:'#2186b1',weight:3,opacity:.8},onEachFeature:(f,l)=>l.bindPopup('Bull Creek · OpenStreetMap centerline, September 2026. This line does not show current water extent.')}).addTo(map);
    networkLayer=L.geoJSON(data.network,{style:{color:'#778a70',weight:2,opacity:.65},onEachFeature:(f,l)=>l.bindPopup(f.properties.name)}).addTo(map);
    routeLayer=L.layerGroup().addTo(map);mileLayer=L.layerGroup().addTo(map);crossingLayer=L.layerGroup().addTo(map);endLayer=L.layerGroup().addTo(map);
    data.sources.forEach(s=>{const li=document.createElement('li');const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener';a.textContent=s.title;li.append(a,` · ${s.date}`);$('source-list').append(li);});
    for(const key of ['ridge','parking'])$(`route-${key}`).addEventListener('click',()=>{chosen=key;renderRoute();});
    $('fit').addEventListener('click',()=>renderRoute());
    $('show-network').addEventListener('change',e=>e.target.checked?networkLayer.addTo(map):map.removeLayer(networkLayer));
    $('basemap').addEventListener('click',()=>{satelliteOn=!satelliteOn;if(satelliteOn){map.removeLayer(topo);satellite.addTo(map);}else{map.removeLayer(satellite);topo.addTo(map);} $('basemap').textContent=satelliteOn?'Topo map':'Satellite';$('basemap').setAttribute('aria-pressed',String(satelliteOn));});
    renderRoute();
  }catch(error){$('plan-description').textContent='The map could not load. Reload with a connection, or use the GPX download.';$('location-note').textContent=error.message;console.error(error);}
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
