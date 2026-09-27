import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MapContainer, Circle, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Home,
  ListChecks,
  MessageCircle,
  MapPin,
  MapPinned,
  RadioTower,
  Send,
  ShieldCheck,
  Smartphone,
  Users,
  Wrench
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

setWorkerUrl(mapLibreWorkerUrl);

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

async function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem("eneo-token");
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && token && !url.includes("/auth/")) {
    sessionStorage.removeItem("eneo-token");
    sessionStorage.removeItem("eneo-user");
    window.dispatchEvent(new CustomEvent("eneo-session-expired"));
  }
  return response;
}

const severityColor = {
  low: "#f5a623",
  medium: "#f97316",
  high: "#ef4444",
  critical: "#b91c1c"
};

const statusLabel = {
  pending: "Collecting nearby reports",
  pending_validation: "Pending validation",
  validated: "Validated",
  assigned: "Assigned",
  on_the_way: "On the way",
  under_intervention: "Under intervention",
  completed: "Completed",
  verification_pending: "Restoration verification",
  closed: "Closed",
  rejected: "Rejected"
};

const nextIncidentStatuses = {
  pending_validation: ["validated", "rejected", "pending"],
  pending: ["pending_validation", "rejected"],
  validated: ["assigned", "rejected"],
  assigned: ["on_the_way"],
  on_the_way: ["under_intervention"],
  under_intervention: ["completed"],
  completed: ["verification_pending"],
  verification_pending: ["closed", "under_intervention"],
  closed: [], rejected: []
};

function useIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [incidentResponse, reportResponse] = await Promise.all([
      apiFetch(`${API_BASE}/incidents`),
      apiFetch(`${API_BASE}/reports`)
    ]);
    setIncidents(await incidentResponse.json());
    setReports(await reportResponse.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  return { incidents, reports, loading, reload: load, setIncidents };
}

function SeverityBadge({ severity }) {
  return (
    <span className="badge" style={{ "--badge-color": severityColor[severity] }}>
      {severity}
    </span>
  );
}

function MetricTile({ icon: Icon, label, value, tone = "blue" }) {
  return <div className="metricTile"><span className={`metricIcon ${tone}`}><Icon size={19}/></span><span>{label}</span><strong>{value}</strong></div>;
}

function MapAutoFit({ incidents, reports }) {
  const map = useMap();
  const lastData = useRef("");
  const centeredOnUser = useRef(false);
  const [userPosition, setUserPosition] = useState(null);
  const signature = useMemo(() => [...incidents, ...reports].map(item => `${item.latitude},${item.longitude}`).join("|"), [incidents, reports]);
  useEffect(() => {
    if (centeredOnUser.current || lastData.current === signature) return;
    lastData.current = signature;
    const points = [...incidents, ...reports].map(item => [Number(item.latitude), Number(item.longitude)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (!points.length) { map.setView([5.5, 12.5], 6); return; }
    if (points.length === 1) { map.setView(points[0], 12); return; }
    map.fitBounds(points, { padding: [32, 32], maxZoom: 12 });
  }, [incidents, reports, map, signature]);
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    let active = true;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!active) return;
      const position = [coords.latitude, coords.longitude];
      centeredOnUser.current = true;
      setUserPosition(position);
      map.flyTo(position, 14, { duration: .7 });
    }, () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    return () => { active = false; };
  }, [map]);
  return userPosition && <CircleMarker center={userPosition} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#60a5fa", fillOpacity: 1 }}><Popup>Your current position</Popup></CircleMarker>;
}

function OpenFreeMapLayer() {
  const map = useMap();
  useEffect(() => {
    const layer = maplibreGL({ style: "https://tiles.openfreemap.org/styles/dark", interactive: false });
    layer.addTo(map);
    return () => { if (map.hasLayer(layer)) map.removeLayer(layer); };
  }, [map]);
  return null;
}

function MapFocusIncident({ incidents, incidentId }) {
  const map = useMap();
  const incident = incidents.find(item => String(item.id) === String(incidentId));
  useEffect(() => {
    if (incident) map.flyTo([Number(incident.latitude), Number(incident.longitude)], Math.max(map.getZoom(), 13), { duration: .7 });
  }, [incident?.latitude, incident?.longitude, incidentId, map]);
  return null;
}

function MapControls() {
  const map = useMap();
  const [message, setMessage] = useState("");
  function locate() {
    if (!navigator.geolocation) { setMessage("Location is unavailable in this browser."); return; }
    setMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map.flyTo([coords.latitude, coords.longitude], 14, { duration: .8 });
      setMessage("");
    }, () => setMessage("Allow location access to center the map on you."), { enableHighAccuracy: true, timeout: 12000 });
  }
  return <div className="leaflet-top leaflet-right mapTools"><div className="leaflet-control mapControlCard"><button type="button" onClick={locate}>My location</button><button type="button" onClick={() => map.flyTo([5.5, 12.5], 6, { duration: .7 })}>Cameroon</button>{message && <small>{message}</small>}</div></div>;
}

function IncidentMap({ incidents, reports = [], compact = false, selectedIncidentId, onSelectIncident }) {

  return (
    <div className={compact ? "mapWrap compact" : "mapWrap"}>
      <MapContainer center={[5.5, 12.5]} zoom={6} scrollWheelZoom className="map">
        <OpenFreeMapLayer />
        <MapAutoFit incidents={incidents} reports={reports}/>
        <MapFocusIncident incidents={incidents} incidentId={selectedIncidentId}/>
        <MapControls />
        {incidents.map((incident) => (
          <Circle
            key={incident.id}
            center={[Number(incident.latitude), Number(incident.longitude)]}
            radius={Number(incident.radius_m || 500)}
            eventHandlers={{ click: () => onSelectIncident?.(incident.id) }}
            pathOptions={{
              color: severityColor[incident.severity],
              fillColor: severityColor[incident.severity],
              fillOpacity: 0.34
            }}
          >
            <Popup>
              <strong>{incident.reference}</strong>
              <br />{incident.district}
              <br />{incident.reports_count} reports · {statusLabel[incident.status] || incident.status}
              <br />Severity: {incident.severity} · estimated radius {incident.radius_m || 500} m
              {onSelectIncident && <><br/><button className="mapPopupAction" onClick={() => onSelectIncident(incident.id)}>Focus this incident</button></>}
            </Popup>
          </Circle>
        ))}
        {reports.map(report => <CircleMarker key={`report-${report.id}`} center={[Number(report.latitude), Number(report.longitude)]} pathOptions={{ color: "#f8fafc", fillColor: "#cbd5e1", fillOpacity: .78 }} radius={5}><Popup><strong>Citizen report</strong><br/>{report.district}<br/>Reported {new Date(report.created_at).toLocaleString()}</Popup></CircleMarker>)}
      </MapContainer>
      <div className="mapAttribution">Map tiles: <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · © OpenMapTiles · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
    </div>
  );
}

function LocationMapControls({ center, zoom, onChoose }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [map, center[0], center[1], zoom]);
  useMapEvents({ click(event) { onChoose(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function ReportPage({ reload, reporterName = "" }) {
  const locations = {
    "Adamawa": { "Ngaoundere": ["Dang", "Joli-Soir", "Bali", "Sabongari", "Ngaoundéré I", "Ngaoundéré II"], "Banyo": ["Centre", "Hore Mayo", "Hore Taram"], "Meiganga": ["Centre", "Garga", "Djounde"] },
    "Centre": { "Yaounde": ["Bastos", "Melen", "Mokolo", "Nlongkak", "Essos", "Mvog-Mbi", "Nsam", "Biyem-Assi", "Emombo", "Mendong", "Yaoundé I", "Yaoundé II", "Yaoundé III", "Yaoundé IV", "Yaoundé V", "Yaoundé VI", "Yaoundé VII"], "Mbalmayo": ["Centre", "Abang", "Nkolngok"], "Obala": ["Centre", "Nkolbogo", "Nkometou"] },
    "East": { "Bertoua": ["Centre", "Enia", "Yadembam", "Mokolo I", "Mokolo II", "Bertoua I", "Bertoua II"], "Batouri": ["Centre", "Mbang", "Ndong"], "Abong-Mbang": ["Centre", "Zoume" ] },
    "Far North": { "Maroua": ["Centre", "Domayo", "Palar", "Doualaré", "Zokok", "Djimi", "Mayel Ibbe", "Djarengol", "Ouro Tchede", "Salak", "Maroua I", "Maroua II"], "Kousseri": ["Centre", "Afadé", "Mada"], "Mokolo": ["Centre", "Dougoy" ] },
    "Littoral": { "Douala": ["Akwa", "Bonanjo", "Bonapriso", "Bonamoussadi", "Deido", "Bepanda", "Logbessou", "Makepe", "New Bell", "Village", "PK 14"], "Nkongsamba": ["Centre", "Ebonè", "Mbaressoumtou"], "Edéa": ["Centre", "Pongo", "Ndogbong" ] },
    "North": { "Garoua": ["Centre", "Roumdé Adjia", "Poumpoumré", "Yelwa", "Garoua Winde", "Garoua I", "Garoua II"], "Guider": ["Centre", "Djougui"], "Tchollire": ["Centre", "Barki" ] },
    "North-West": { "Bamenda": ["Commercial Avenue", "Nkwen", "Mankon", "Mile 4", "Mile 3", "Ntarikon", "Bamendankwe", "Bamenda I", "Bamenda II", "Bamenda III"], "Kumbo": ["Squares", "Tobin", "Shisong"], "Ndop": ["Centre", "Bamessing" ] },
    "West": { "Bafoussam": ["Centre", "Famla", "Djeleng", "Banengo", "Tchitchap", "Baleng", "Toungang II", "Tchouwong", "Tsewong", "Bafoussam I", "Bafoussam II", "Bafoussam III"], "Dschang": ["Centre", "Paidground", "Tsinkop"], "Mbouda": ["Centre", "Bamessingue" ] },
    "South": { "Ebolowa": ["Centre", "New-Bell", "Angounou", "Ebolowa I", "Ebolowa II", "Elat", "Eves"], "Kribi": ["Centre", "Mpangou", "Londji"], "Sangmelima": ["Centre", "Bulu" ] },
    "South-West": { "Buea": ["Molyko", "Mile 17", "Great Soppo", "Muea", "Buea Town", "Small Soppo", "Buea I", "Buea II"], "Limbe": ["Down Beach", "Church Street", "New Town", "Bota"], "Kumba": ["Fiango", "Mbonge Road", "Kosala", "Centre" ] }
  };
  const regions = Object.keys(locations);
  const [form, setForm] = useState({
    reporter_name: reporterName,
    phone: "",
    category: "Total outage",
    region: "Littoral",
    city: "Douala",
    quarter: "Akwa",
    latitude: null,
    longitude: null,
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [sentNotice, setSentNotice] = useState("");
  const [locationMessage, setLocationMessage] = useState("Use your location or click the map to pin the outage location.");
  const [placeResults, setPlaceResults] = useState([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

  const regionCenter = { "Adamawa": [7.32, 13.58], "Centre": [3.87, 11.52], "East": [4.58, 13.68], "Far North": [10.59, 14.32], "Littoral": [4.05, 9.7], "North": [9.3, 13.4], "North-West": [5.96, 10.15], "West": [5.48, 10.42], "South": [2.9, 11.15], "South-West": [4.16, 9.24] };

  useEffect(() => {
    if (!navigator.geolocation) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!active) return;
      setForm(current => current.latitude == null ? { ...current, latitude: coords.latitude, longitude: coords.longitude } : current);
      setLocationMessage(`GPS location captured: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}. Adjust the pin if needed.`);
    }, () => {
      if (active) setLocationMessage("Allow location access or click the map to pin the outage location.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    return () => { active = false; };
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setLocationMessage("Location is not supported by this browser. Click the map to pin a location."); return; }
    setLocationMessage("Getting your location…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setForm(current => ({ ...current, latitude: coords.latitude, longitude: coords.longitude }));
      setLocationMessage(`Location captured: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
    }, () => setLocationMessage("Location access was unavailable. Click the map to pin the outage location."), { enableHighAccuracy: true, timeout: 12000 });
  }

  async function searchQuarter() {
    const query = [form.quarter, form.city, form.region].filter(Boolean).join(", ");
    setSearchingPlaces(true);
    setPlaceResults([]);
    try {
      const response = await apiFetch(`${API_BASE}/geocode/quarters?q=${encodeURIComponent(query)}`);
      const result = await response.json();
      if (!response.ok) { setLocationMessage(result.error || "Could not search for that quarter."); return; }
      setPlaceResults(result.places || []);
      setLocationMessage(result.places?.length ? "Choose a matching mapped place, or keep your own quarter name and pin." : "No mapped match found. Keep your quarter name and pin the report location.");
    } catch { setLocationMessage("Place lookup is unavailable. You can still enter the quarter and pin it on the map."); }
    finally { setSearchingPlaces(false); }
  }

  function chooseQuarter(place) {
    const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const regionNames = {
      "adamawa": ["adamawa", "adamaoua"], "centre": ["centre"], "east": ["east", "est"],
      "far north": ["far north", "extreme-nord", "extreme nord"], "littoral": ["littoral"],
      "north": ["north", "nord"], "north-west": ["north-west", "north west", "nord-ouest", "nord ouest"],
      "west": ["west", "ouest"], "south": ["south", "sud"], "south-west": ["south-west", "south west", "sud-ouest", "sud ouest"]
    };
    const matchedRegion = regions.find(region => regionNames[region].some(name => normalize(place.region).includes(normalize(name))));
    setForm(current => ({ ...current, region: matchedRegion || current.region, city: place.city || current.city, quarter: place.name, latitude: place.latitude, longitude: place.longitude }));
    setPlaceResults([]);
    setLocationMessage(`Mapped ${place.displayName}; location pinned at ${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}.`);
  }

  async function submitReport(event) {
    event.preventDefault();
    setSubmitting(true);
    if (form.latitude == null || form.longitude == null) { setLocationMessage("Set the outage location with the location button or by clicking the map before sending."); setSubmitting(false); return; }
    const district = `${form.quarter}, ${form.city}, ${form.region}`;
    const response = await apiFetch(`${API_BASE}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, district, latitude: form.latitude, longitude: form.longitude })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setLocationMessage(result.error || "Could not send the report. Please try again."); setSubmitting(false); return; }
    const qualification = result.qualification || {};
    setSentNotice(qualification.qualified
      ? `Report clustered with ${result.incident?.reports_count || "nearby"} reports and sent to SOCADEL for validation.`
      : `Report received. This zone is collecting reports (${result.incident?.reports_count || 1}/${qualification.minimumReports || 1}); it will go to SOCADEL after the threshold is reached.`);
    setForm((current) => ({ ...current, description: "" }));
    await reload();
    setSubmitting(false);
  }

  return (
    <section className="pagePanel">
      <div className="pageIntro">
        <h2>Report a problem</h2>
        <p>Send a geolocated electricity report so the system can cluster it with nearby complaints.</p>
      </div>
      <form className="reportForm" onSubmit={submitReport}>
        {sentNotice && <div className="sendConfirmation"><CheckCircle2 size={18}/>{sentNotice}</div>}
        <input
          placeholder="Your name"
          value={form.reporter_name}
          onChange={(event) => setForm({ ...form, reporter_name: event.target.value })}
        />
        <input
          placeholder="Phone number"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
        <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            <option>Total outage</option>
            <option>Low voltage</option>
            <option>Electric pole issue</option>
            <option>Dangerous cable</option>
        </select>
        <small className="qualificationHint">The system calculates incident severity from the number and spread of nearby reports.</small>
        <div className="locationFields"><label>Region<select value={form.region} onChange={event => { const region = event.target.value; const city = Object.keys(locations[region])[0]; setForm(current => ({ ...current, region, city, quarter: "" })); setPlaceResults([]); }}>{regions.map(region => <option key={region}>{region}</option>)}</select></label>
          <label>City / town<input list="known-cities" value={form.city} onChange={event => setForm(current => ({ ...current, city: event.target.value }))} placeholder="Enter any city or town"/><datalist id="known-cities">{Object.keys(locations[form.region] || {}).map(city => <option key={city} value={city}/>)}</datalist></label>
          <label>Quarter / neighbourhood<input list="known-quarters" value={form.quarter} onChange={event => setForm(current => ({ ...current, quarter: event.target.value }))} placeholder="Choose a suggestion or enter any quarter"/><datalist id="known-quarters">{(locations[form.region]?.[form.city] || []).map(quarter => <option key={quarter} value={quarter}/>)}</datalist><small>Suggestions are available for all 10 regions; you can also type any quarter name.</small></label></div>
        <div className="locationTools"><button type="button" className="locationButton" onClick={useCurrentLocation}><MapPin size={17}/> Use my current location</button><button type="button" className="locationButton secondary" onClick={searchQuarter} disabled={searchingPlaces || !form.city.trim()}>{searchingPlaces ? "Searching…" : "Find mapped quarter"}</button><span>{locationMessage}</span></div>
        {!!placeResults.length && <div className="quarterResults" aria-label="Mapped quarter search results">{placeResults.map((place, index) => <button type="button" key={`${place.latitude}-${place.longitude}-${index}`} onClick={() => chooseQuarter(place)}><strong>{place.name}</strong><small>{place.displayName}</small></button>)}</div>}
        <div className="reportMap"><MapContainer center={form.latitude != null ? [form.latitude, form.longitude] : regionCenter[form.region]} zoom={form.latitude != null ? 15 : 11} scrollWheelZoom className="map"><OpenFreeMapLayer/><LocationMapControls center={form.latitude != null ? [form.latitude, form.longitude] : regionCenter[form.region]} zoom={form.latitude != null ? 15 : 11} onChoose={(latitude, longitude) => { setForm(current => ({ ...current, latitude, longitude })); setLocationMessage(`Pinned location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`); }}/>{form.latitude != null && <CircleMarker center={[form.latitude, form.longitude]} radius={9} pathOptions={{ color: "#f5a623", fillColor: "#f5a623", fillOpacity: .9 }}><Popup>Selected outage location</Popup></CircleMarker>}</MapContainer></div>
        <textarea
          placeholder="What is happening?"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
        <button type="submit" disabled={submitting}>
          <Send size={18} />
          {submitting ? "Sending..." : "Send report"}
        </button>
      </form>
    </section>
  );
}

function HomePage({ incidents, reports, setPage }) {
  const active = incidents.filter((incident) => !["closed", "rejected"].includes(incident.status));
  const latest = active[0];

  return (
    <>
      <section className="marketingHero">
        <div className="heroCopy"><span className="heroEyebrow"><RadioTower size={15}/> POWERWATCH CAMEROON</span><h2>Know what’s happening on your power line.</h2><p>Report outages, see nearby incidents, and follow field response as it happens.</p><div className="heroActions"><button onClick={() => setPage("report")}><Send size={17}/> Report an outage</button><button className="heroSecondary" onClick={() => setPage("map")}><MapPinned size={17}/> Explore live map</button></div></div>
        <span className="heroSignal">LIVE NETWORK VIEW <i/></span>
      </section>
      <section className="statusPanel">
        <button onClick={() => setPage("map")}><span className="metricIcon blue"><MapPinned size={19}/></span>
          <span>Live monitored zones</span>
          <strong>{active.length}</strong>
        </button>
        <button onClick={() => setPage("incidents")}><span className="metricIcon violet"><ClipboardList size={19}/></span>
          <span>Citizen reports</span>
          <strong>{reports.length}</strong>
        </button>
        <button onClick={() => setPage("track")}><span className="metricIcon amber"><AlertTriangle size={19}/></span>
          <span>High risk</span>
          <strong>{incidents.filter((item) => ["high", "critical"].includes(item.severity)).length}</strong>
        </button>
      </section>

      {latest && (
        <section className="primaryIncident">
          <div className="incidentTitle">
            <AlertTriangle size={20} />
            <div>
              <h2>{latest.district}</h2>
              <p>{latest.reference} · {latest.reports_count} correlated reports</p>
            </div>
          </div>
          <div className="rowBetween">
            <SeverityBadge severity={latest.severity} />
            <span>{statusLabel[latest.status] || latest.status}</span>
          </div>
          <p className="resolution">{latest.resolution}</p>
        </section>
      )}

      <section className="quickActions">
        <button onClick={() => setPage("report")}>
          <Send size={20} />
          <span>Report problem</span>
        </button>
        <button onClick={() => setPage("map")}>
          <MapPinned size={20} />
          <span>View map</span>
        </button>
        <button onClick={() => setPage("track")}>
          <ListChecks size={20} />
          <span>Track solution</span>
        </button>
      </section>
    </>
  );
}

function MapPage({ incidents, reports }) {
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showReports, setShowReports] = useState(true);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const visibleIncidents = useMemo(() => incidents.filter(incident => {
    const severityMatches = severityFilter === "all" || incident.severity === severityFilter;
    const statusMatches = statusFilter === "all" || (statusFilter === "active" ? !["closed", "rejected"].includes(incident.status) : incident.status === statusFilter);
    return severityMatches && statusMatches;
  }), [incidents, severityFilter, statusFilter]);
  return (
    <section className="pagePanel">
      <div className="pageIntro">
        <h2>Live outage intelligence map</h2>
        <p>Explore citizen report density, 500 m / 30 min incident clusters, qualification status, and severity across Cameroon.</p>
      </div>
      <div className="mapToolbar">
        <label>Severity<select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}><option value="all">All levels</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label>Incident status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="active">Active incidents</option><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="densityToggle"><input type="checkbox" checked={showReports} onChange={event => setShowReports(event.target.checked)}/>Show individual reports</label>
        <span>{visibleIncidents.length} zones · {showReports ? reports.length : 0} report points</span>
      </div>
      <IncidentMap incidents={visibleIncidents} reports={showReports ? reports : []} selectedIncidentId={selectedIncidentId} onSelectIncident={setSelectedIncidentId}/>
      <div className="legendGrid">
        {Object.entries(severityColor).map(([severity, color]) => (
          <span key={severity}><i style={{ background: color }} /> {severity}</span>
        ))}
      </div>
      <div className="mapIncidentList" aria-label="Mapped incident zones">
        {visibleIncidents.map(incident => <button key={incident.id} type="button" className={String(selectedIncidentId) === String(incident.id) ? "selected" : ""} onClick={() => setSelectedIncidentId(incident.id)}><span className="zoneSeverity" style={{ background: severityColor[incident.severity] }}/><span className="zoneDetails"><strong>{incident.reference} · {incident.district}</strong><small>{incident.reports_count} citizen reports · {statusLabel[incident.status] || incident.status}</small></span><span className="zoneArrow">View</span></button>)}
        {!visibleIncidents.length && <p>No incidents match these filters.</p>}
      </div>
    </section>
  );
}

function IncidentFeedback({ incident }) {
  const [counts, setCounts] = useState({ also_affected: 0, restored: 0 });
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    apiFetch(`${API_BASE}/incidents/${incident.id}/confirmations`).then(response => response.json()).then(setCounts).catch(() => {});
  }, [incident.id]);
  async function confirm(type) {
    let reporterKey = localStorage.getItem("eneo-reporter-key");
    if (!reporterKey) {
      reporterKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      localStorage.setItem("eneo-reporter-key", reporterKey);
    }
    const response = await apiFetch(`${API_BASE}/incidents/${incident.id}/confirmations`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, reporter_key: reporterKey, comment })
    });
    const result = await response.json();
    if (response.ok) { setCounts(result); setComment(""); setNotice(type === "restored" ? "Restoration reported" : "Marked as also affected"); }
    else setNotice(result.error || "Could not save your response");
  }
  return <div className="citizenFeedback">
    <textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="Optional short comment" maxLength={500}/>
    <div><button onClick={() => confirm("also_affected")}>Also affected ({counts.also_affected || 0})</button><button onClick={() => confirm("restored")}>Power restored ({counts.restored || 0})</button></div>
    {notice && <small aria-live="polite">{notice}</small>}
  </div>;
}

function IncidentsPage({ incidents }) {
  return (
    <section className="pagePanel">
      <div className="pageIntro">
        <h2>Public incident feed</h2>
        <p>Citizens can see the current state and known solution for reported electricity problems.</p>
      </div>
      <div className="feedList">
        {incidents.map((incident) => (
          <article key={incident.id} className="feedItem incidentCard">
            <div>
              <strong>{incident.district}</strong>
              <p>{incident.root_cause}</p>
              <p>{incident.resolution}</p>
            </div>
            <SeverityBadge severity={incident.severity} />
            <IncidentFeedback incident={incident}/>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrackPage({ incidents }) {
  return (
    <section className="pagePanel">
      <div className="pageIntro">
        <h2>Track intervention</h2>
        <p>Follow each incident from SOCADEL validation to field completion and closure.</p>
      </div>
      <div className="trackingList">
        {incidents.map((incident) => {
          const steps = ["pending_validation", "validated", "assigned", "on_the_way", "under_intervention", "completed", "verification_pending", "closed"];
          const activeIndex = Math.max(0, steps.indexOf(incident.status));
          return (
            <article key={incident.id} className="trackingCard">
              <div className="rowBetween">
                <div>
                  <strong>{incident.reference}</strong>
                  <p>{incident.district}</p>
                </div>
                <SeverityBadge severity={incident.severity} />
              </div>
              <div className="stepLine">
                {steps.map((step, index) => (
                  <span key={step} className={index <= activeIndex ? "done" : ""} title={statusLabel[step]} />
                ))}
              </div>
              <p className="resolution">{statusLabel[incident.status] || incident.status}: {incident.resolution}</p>
              {incident.agency_report && <div className="agencyReport"><strong>Agency field report</strong><p>{incident.agency_report}</p><small>Submitted by {incident.assignee || "Field agency"}</small></div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MobileShell({ incidents, reports, reload }) {
  const [page, setPage] = useState("home");
  const pageTitle = {
    home: "Electricity incident tracker",
    map: "Problem zones",
    report: "Report outage",
    incidents: "Public reports",
    track: "Track solution"
  };

  return (
    <div className="phoneFrame">
      <div className="phoneTop">
        <span>9:41</span>
        <span className="signal">5G</span>
      </div>
      <main className="mobileApp">
        <header className="appHeader">
          <div>
            <p>PowerWatch Cameroon</p>
            <h1>{pageTitle[page]}</h1>
          </div>
          <div className="iconBubble">
            <RadioTower size={22} />
          </div>
        </header>

        <nav className="mobileTabs">
          <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}><Home size={18} /> Home</button>
          <button className={page === "map" ? "active" : ""} onClick={() => setPage("map")}><MapPinned size={18} /> Map</button>
          <button className={page === "report" ? "active" : ""} onClick={() => setPage("report")}><Send size={18} /> Report</button>
          <button className={page === "incidents" ? "active" : ""} onClick={() => setPage("incidents")}><ClipboardList size={18} /> Feed</button>
          <button className={page === "track" ? "active" : ""} onClick={() => setPage("track")}><ListChecks size={18} /> Track</button>
        </nav>

        {page === "home" && <HomePage incidents={incidents} reports={reports} setPage={setPage} />}
        {page === "map" && <MapPage incidents={incidents} reports={reports}/>}
        {page === "report" && <ReportPage reload={reload} />}
        {page === "incidents" && <IncidentsPage incidents={incidents} />}
        {page === "track" && <TrackPage incidents={incidents} />}
      </main>
    </div>
  );
}

function AdminDashboard({ incidents, reports, reload, onLogout }) {
  const [actionMessage, setActionMessage] = useState("");
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentSelections, setAgentSelections] = useState({});
  const [clusterConfig, setClusterConfig] = useState({ cluster_distance_m: 500, cluster_window_minutes: 30, min_reports_to_qualify: 1 });
  const [configNotice, setConfigNotice] = useState("");
  useEffect(() => {
    const loadAgents = () => apiFetch(`${API_BASE}/admin/agents`).then(response => response.ok ? response.json() : Promise.reject(new Error("Could not load agent accounts."))).then(rows => { setAgents(Array.isArray(rows) ? rows : []); setAgentsLoading(false); }).catch(() => { setAgents([]); setAgentsLoading(false); });
    loadAgents();
    const agentTimer = setInterval(loadAgents, 8000);
    apiFetch(`${API_BASE}/admin/clustering-config`).then(response => response.json()).then(setClusterConfig).catch(() => {});
    return () => clearInterval(agentTimer);
  }, []);
  const stats = useMemo(
    () => ({
      pending: incidents.filter((item) => item.status === "pending_validation").length,
      field: incidents.filter((item) => ["assigned", "on_the_way", "under_intervention"].includes(item.status)).length,
      completed: incidents.filter((item) => ["completed", "closed"].includes(item.status)).length
    }),
    [incidents]
  );

  async function updateIncident(id, updates) {
    const response = await apiFetch(`${API_BASE}/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setActionMessage(result.error || "Could not update this incident.");
      if (response.status === 409) await reload();
      return;
    }
    setActionMessage("");
    await reload();
  }

  async function saveClusterConfig(event) {
    event.preventDefault();
    setConfigNotice("");
    const response = await apiFetch(`${API_BASE}/admin/clustering-config`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clusterConfig)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setConfigNotice(result.error || "Could not save clustering rules."); return; }
    setClusterConfig(result);
    setConfigNotice("Qualification rules saved.");
  }

  return (
    <main className="adminPage">
      <aside className="adminSidebar">
        <div className="brandMark">
          <ShieldCheck size={24} />
          <div>
            <strong>SOCADEL Ops</strong>
            <span>Decision support</span>
          </div>
        </div>
        <nav>
          <a href="#overview"><BarChart3 size={18} /> Overview</a>
          <a href="#incidents"><ClipboardList size={18} /> Incidents</a>
          <a href="#qualification-rules"><ListChecks size={18} /> Qualification rules</a>
          <a href="#teams"><Users size={18} /> Teams</a>
          <a href="/"><Smartphone size={18} /> Mobile app</a>
        </nav>
      </aside>

      <section className="adminContent">
        <header className="adminHeader">
          <div>
            <p>Admin web console</p>
            <h1>Validate, assign and monitor electricity incidents</h1>
          </div>
          <button onClick={reload}>
            <RadioTower size={18} />
            Sync
          </button>
          <button onClick={onLogout}>Sign out</button>
        </header>

        <div className="metricGrid" id="overview">
          <MetricTile icon={RadioTower} tone="blue" label="Collecting reports" value={incidents.filter((item) => item.status === "pending").length}/>
          <MetricTile icon={ClipboardList} tone="amber" label="Pending validation" value={stats.pending}/>
          <MetricTile icon={Wrench} tone="violet" label="Field operations" value={stats.field}/>
          <MetricTile icon={CheckCircle2} tone="green" label="Completed" value={stats.completed}/>
          <MetricTile icon={Users} tone="rose" label="Total reports" value={reports.length}/>
        </div>

        <IncidentMap incidents={incidents} reports={reports}/>

        <section className="adminTable" id="qualification-rules">
          <div className="tableHeader"><h2>Intelligent qualification rules</h2><span>Applied to new citizen reports</span></div>
          <form className="clusterSettings" onSubmit={saveClusterConfig}>
            <label>Clustering distance (m)<input type="number" min="50" max="10000" value={clusterConfig.cluster_distance_m} onChange={event => setClusterConfig(current => ({ ...current, cluster_distance_m: Number(event.target.value) }))}/></label>
            <label>Time window (minutes)<input type="number" min="5" max="1440" value={clusterConfig.cluster_window_minutes} onChange={event => setClusterConfig(current => ({ ...current, cluster_window_minutes: Number(event.target.value) }))}/></label>
            <label>Reports needed to qualify<input type="number" min="1" max="100" value={clusterConfig.min_reports_to_qualify} onChange={event => setClusterConfig(current => ({ ...current, min_reports_to_qualify: Number(event.target.value) }))}/></label>
            <button type="submit">Save qualification rules</button>
            {configNotice && <small role="status">{configNotice}</small>}
          </form>
          <p className="qualificationHint">A cluster remains in report collection until the minimum is met. Only then does it enter SOCADEL validation; work assignment still requires agent approval.</p>
        </section>

        <section className="adminTable" id="incidents">
          <div className="tableHeader">
            <h2>Qualified incident cards</h2>
            <span>SOCADEL keeps authority before dispatch</span>
          </div>
          {actionMessage && <div className="notice" role="alert">{actionMessage}</div>}
          {incidents.map((incident) => (
            <article key={incident.id} className="incidentRow">
              <div>
                <strong>{incident.reference}</strong>
                <h3>{incident.title}</h3>
                <p><MapPin size={15} /> {incident.district} · {incident.reports_count} reports · {incident.radius_m}m radius</p>
              </div>
              <SeverityBadge severity={incident.severity} />
              {incident.status === "pending" ? <div className="qualificationProgress"><strong>Collecting reports: {incident.reports_count || 0}/{clusterConfig.min_reports_to_qualify}</strong><small>Validation and agent assignment unlock when this cluster qualifies.</small><button type="button" onClick={() => updateIncident(incident.id, { status: "rejected", actor: "SOCADEL operator" })}>Reject alert</button></div> : incident.status === "pending_validation" ? <div className="incidentActions"><button type="button" onClick={() => updateIncident(incident.id, { status: "validated", actor: "SOCADEL operator" })}>Validate incident</button><button type="button" className="secondaryAction" onClick={() => updateIncident(incident.id, { status: "rejected", actor: "SOCADEL operator" })}>Reject</button></div> : incident.status === "validated" ? <div className="assignmentControls"><label>Agent account<select aria-label={`Choose agent for ${incident.reference}`} value={agentSelections[incident.id] || ""} disabled={agentsLoading || agents.length === 0} onChange={event => setAgentSelections(current => ({ ...current, [incident.id]: event.target.value }))}><option value="">{agentsLoading ? "Loading agent accounts…" : agents.length ? "Select an agent from the database" : "No agent accounts found"}</option>{agents.map(agent => <option key={agent.id || agent.username} value={agent.name}>{agent.name} (@{agent.username})</option>)}</select></label><button type="button" disabled={!agentSelections[incident.id]} onClick={() => updateIncident(incident.id, { status: "assigned", assignee: agentSelections[incident.id], resolution: `SOCADEL issued a Work Request to ${agentSelections[incident.id]}.`, actor: "SOCADEL operator" })}>Send Work Request</button></div> : incident.status === "assigned" ? <div className="assignmentControls"><strong>Work Request sent to {incident.assignee}</strong></div> : <select aria-label={`Status for ${incident.reference}`} value={incident.status} onChange={event => updateIncident(incident.id, { status: event.target.value, actor: "SOCADEL operator" })}>{[incident.status, ...(nextIncidentStatuses[incident.status] || [])].map(value => <option key={value} value={value}>{statusLabel[value] || value}</option>)}</select>}
            </article>
          ))}
        </section>
        <section className="adminTable" id="teams">
          <div className="tableHeader"><h2>Field agency reports</h2><span>Reports submitted after intervention</span></div>
          {incidents.filter((incident) => incident.agency_report).map((incident) => <article className="feedItem" key={incident.id}><div><strong>{incident.reference} · {incident.district}</strong><p>{incident.agency_report}</p><small>{incident.assignee}</small></div></article>)}
          {!incidents.some((incident) => incident.agency_report) && <p>No field reports submitted yet.</p>}
        </section>
      </section>
    </main>
  );
}

function SignIn({ role, onLogin, notice = "" }) {
  const [name, setName] = useState(role === "admin" ? "admin" : "");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const canRegister = role === "client" || role === "agency";
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const endpoint = creatingAccount ? "register" : "login";
      const response = await fetch(`${API_BASE}/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, username: name, name: fullName, password }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || (creatingAccount ? "Account creation failed." : "Sign in failed.")); setBusy(false); return; }
      onLogin(result.user, result.token);
    } catch { setError("Could not connect to the account service."); }
    setBusy(false);
  }
  return <main className="loginPage"><form className="loginCard" onSubmit={submit}>
    <div className="brandMark"><ShieldCheck size={24}/><div><strong>SOCADEL Ops</strong><span>PowerWatch Cameroon</span></div></div>
    <p className="eyebrow">{role === "agency" ? "AGENT / SUBCONTRACTOR PORTAL" : role === "client" ? "CLIENT PORTAL" : "ADMIN PORTAL"}</p>
    <h1>{creatingAccount ? "Create your account" : "Sign in"}</h1><p>{creatingAccount ? "Choose a username and password for your account." : "Access your outage operations workspace."}</p>
    {notice && <div className="notice" role="status">{notice}</div>}
    {creatingAccount && <label>Full name<input autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} required maxLength={120} /></label>}
    <label>Username<input autoComplete="username" value={name} onChange={event => setName(event.target.value)} required minLength={3} maxLength={40} /></label>
    <label>Password<input type="password" autoComplete={creatingAccount ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} required minLength={creatingAccount ? 8 : 1} maxLength={128} placeholder={creatingAccount ? "Choose a password (8+ characters)" : "Enter password"} /></label>
    {error && <div className="notice" role="alert">{error}</div>}
    <button type="submit" disabled={busy}>{busy ? (creatingAccount ? "Creating account..." : "Signing in...") : creatingAccount ? "Create account" : "Sign in"}</button>
    {canRegister ? <p className="accountToggle">{creatingAccount ? "Already have an account?" : "New to PowerWatch?"} <button type="button" onClick={() => { setCreatingAccount(value => !value); setError(""); }}>{creatingAccount ? "Sign in" : "Create an account"}</button></p> : <small>Administrator login: username <strong>admin</strong>, password <strong>admin</strong>.</small>}
    {creatingAccount && role === "agency" && <small>Your agent account will be available to SOCADEL for work assignment.</small>}
  </form></main>;
}

function AgencyDashboard({ incidents, reload, user, onLogout }) {
  const assigned = incidents.filter(item => item.assignee === user.name);
  const [notifications, setNotifications] = useState([]);
  const [actionMessage, setActionMessage] = useState("");
  const [page, setPage] = useState("overview");
  useEffect(() => {
    let alive = true;
    const refresh = () => apiFetch(`${API_BASE}/notifications?agency=${encodeURIComponent(user.name)}`).then(response => response.json()).then(items => { if (alive) setNotifications(items); }).catch(() => {});
    refresh(); const timer = setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [user.name]);
  async function submitFieldReport(incident, report) {
    const response = await apiFetch(`${API_BASE}/incidents/${incident.id}/work-request`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...report, status: "completed" }) });
    if (!response.ok) { const result = await response.json().catch(() => ({})); setActionMessage(result.error || "Could not submit the technical report."); return; }
    setActionMessage("");
    await reload();
  }
  async function advanceWork(incident, status) {
    const response = await apiFetch(`${API_BASE}/incidents/${incident.id}/work-request`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) { const result = await response.json().catch(() => ({})); setActionMessage(result.error || "Could not update field status."); return; }
    setActionMessage("");
    await reload();
  }
  return <main className="agencyPage"><header className="agencyTop"><div><p>SOCADEL AGENT FIELD OPERATIONS</p><h1>{user.name}</h1><span>Assignments and notifications</span></div><button onClick={onLogout}>Sign out</button></header>
    <nav className="roleBottomNav" aria-label="Agent dashboard">
      <button className={page === "overview" ? "active" : ""} onClick={() => setPage("overview")}><Home size={18}/>Overview</button>
      <button className={page === "updates" ? "active" : ""} onClick={() => setPage("updates")}><RadioTower size={18}/>Updates{notifications.length > 0 && <i>{notifications.length}</i>}</button>
      <button className={page === "work" ? "active" : ""} onClick={() => setPage("work")}><Wrench size={18}/>Work requests</button>
    </nav>
    {page === "overview" && <>
      <section className="metricGrid"><MetricTile icon={MapPinned} tone="blue" label="Assigned areas" value={assigned.length}/><MetricTile icon={AlertTriangle} tone="amber" label="Needs action" value={assigned.filter(item => !item.agency_report).length}/><MetricTile icon={CheckCircle2} tone="green" label="Reports sent" value={assigned.filter(item => item.agency_report).length}/></section>
      <div className="qualificationNotice"><ShieldCheck size={18}/><span>Only work requests validated and assigned by SOCADEL appear here. Citizen clusters are not dispatched automatically.</span></div>
      <section className="notificationsPanel"><div className="rowBetween"><h2>Next assigned work</h2><button className="textAction" onClick={() => setPage("work")}>Open work requests</button></div>{assigned.slice(0, 3).map(item => <button className="agentSummary" type="button" key={item.id} onClick={() => setPage("work")}><span><strong>{item.reference} · {item.district}</strong><small>{statusLabel[item.status] || item.status} · {item.reports_count} citizen reports</small></span><SeverityBadge severity={item.severity}/></button>)}{!assigned.length && <p>No work requests have been assigned to your account yet.</p>}</section>
    </>}
    {page === "updates" && <section className="notificationsPanel"><div className="rowBetween"><h2>Notifications</h2><span>{notifications.length} case updates</span></div>{notifications.length ? notifications.map(item => <a key={item.id} href="#" onClick={event => { event.preventDefault(); setPage("work"); }}>{item.message}<small>{new Date(item.created_at).toLocaleString()}</small></a>) : <p>No notifications yet. New assignments and citizen updates will appear here.</p>}</section>}
    {page === "work" && <section><div className="agentPageHeading"><div><p className="eyebrow">FIELD QUEUE</p><h2>My work requests</h2></div><span>{assigned.length} assigned</span></div>{actionMessage && <div className="notice" role="alert">{actionMessage}</div>}{assigned.map(item => <AgencyJob key={item.id} incident={item} user={user} onSubmit={submitFieldReport} onAdvance={advanceWork}/>)}{!assigned.length && <section className="pagePanel"><h2>No assignments yet</h2><p>SOCADEL validated incidents and issued Work Requests will appear here.</p></section>}</section>}
  </main>;
}

function AgencyJob({ incident, onSubmit, onAdvance, user }) {
  const [report, setReport] = useState(incident.agency_report || "");
  const [rootCause, setRootCause] = useState(incident.root_cause || "");
  const [equipment, setEquipment] = useState("");
  const [replacedComponents, setReplacedComponents] = useState("");
  const [notice, setNotice] = useState(false);
  useEffect(() => { if (incident.status === "assigned") { setNotice(true); const timer = setTimeout(() => setNotice(false), 6000); return () => clearTimeout(timer); } }, [incident.id, incident.status]);
  const nextWorkStatus = { assigned: "on_the_way", on_the_way: "under_intervention" }[incident.status];
  return <article className="agencyJob" id={`case-${incident.id}`}><div className="rowBetween"><div><span className="eyebrow">{incident.reference}</span><h2>{incident.district}</h2></div><SeverityBadge severity={incident.severity}/></div><p>{incident.title}</p><p><strong>Status:</strong> {statusLabel[incident.status] || incident.status}</p>{notice && <div className="notice"><RadioTower size={17}/> New problem area assigned. Please review the work request.</div>}
    <AssignedCitizenReports incidentId={incident.id}/>
    <CaseChat incident={incident} role="agency" name={user.name}/>
    {nextWorkStatus && <button onClick={() => onAdvance(incident, nextWorkStatus)}>{nextWorkStatus === "on_the_way" ? "Start travel" : "Begin intervention"}</button>}
    {incident.status === "under_intervention" && <><label>Root cause<input value={rootCause} onChange={event => setRootCause(event.target.value)} placeholder="Observed or confirmed cause"/></label><label>Equipment used<input value={equipment} onChange={event => setEquipment(event.target.value)} placeholder="Equipment or tools"/></label><label>Components replaced<textarea value={replacedComponents} onChange={event => setReplacedComponents(event.target.value)} placeholder="Parts replaced, if any"/></label><label>Technical field report<textarea placeholder="Diagnosis, work performed, and restoration status" value={report} onChange={event => setReport(event.target.value)}/></label><button disabled={!report.trim()} onClick={() => onSubmit(incident, { root_cause: rootCause, equipment, replaced_components: replacedComponents, diagnosis: report, technical_comments: report })}>Complete work and submit report</button></>}
    {incident.agency_report && <div className="agencyReport"><strong>Submitted report</strong><p>{incident.agency_report}</p></div>}</article>;
}

function AssignedCitizenReports({ incidentId }) {
  const [reports, setReports] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () => apiFetch(`${API_BASE}/agency/incidents/${incidentId}/reports`).then(response => response.ok ? response.json() : []).then(rows => { if (active) setReports(Array.isArray(rows) ? rows : []); }).catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [incidentId]);
  return <section className="citizenReportList"><h3>Citizen reports in this incident ({reports.length})</h3>{reports.length ? reports.map(report => <article key={report.id}><strong>{report.category}</strong><p>{report.description || "No additional description provided."}</p><small>{report.district} · {new Date(report.created_at).toLocaleString()}</small>{/^https?:\/\//i.test(report.photo_url || "") && <a href={report.photo_url} target="_blank" rel="noreferrer">View attached photo</a>}</article>) : <p>No client report details available yet.</p>}</section>;
}

function ClientDashboard({ incidents, reports, reload, user, onLogout }) {
  const [page, setPage] = useState("home");
  const [caseId, setCaseId] = useState(incidents[0]?.id ?? "");
  useEffect(() => { if (!incidents.some(item => String(item.id) === String(caseId)) && incidents[0]) setCaseId(incidents[0].id); }, [incidents, caseId]);
  const currentCase = incidents.find(item => String(item.id) === String(caseId));
  return <main className="clientPortal">
    <header className="clientPortalHeader"><div><p>POWERWATCH CAMEROON</p><h1>Hello, {user.name}</h1><span>Report outages and follow your cases.</span></div><button onClick={onLogout}>Sign out</button></header>
    <section className="clientPortalContent">
      {page === "home" && <HomePage incidents={incidents} reports={reports} setPage={setPage}/>}
      {page === "map" && <MapPage incidents={incidents} reports={reports}/>}
      {page === "report" && <ReportPage reload={reload} reporterName={user.name}/>}
      {page === "incidents" && <IncidentsPage incidents={incidents}/>}
      {page === "track" && <TrackPage incidents={incidents}/>}
      {page === "chat" && <section className="pagePanel"><div className="pageIntro"><h2>Chat with SOCADEL</h2><p>Choose a case to message its assigned field agency. Replies appear live in this conversation.</p></div>{incidents.length ? <><label className="caseSelectLabel">Select a case<select value={caseId} onChange={event => setCaseId(event.target.value)}>{incidents.map(item => <option key={item.id} value={item.id}>{item.reference} · {item.district}</option>)}</select></label>{currentCase && <CaseChat incident={currentCase} role="client" name={user.name}/>}</> : <p>Submit a problem report to create a case and start a conversation.</p>}</section>}
    </section>
    <nav className="clientPortalNav" aria-label="Client dashboard">
      <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}><Home size={18}/>Home</button>
      <button className={page === "map" ? "active" : ""} onClick={() => setPage("map")}><MapPinned size={18}/>Map</button>
      <button className={page === "report" ? "active" : ""} onClick={() => setPage("report")}><Send size={18}/>Report</button>
      <button className={page === "incidents" ? "active" : ""} onClick={() => setPage("incidents")}><ClipboardList size={18}/>Reports</button>
      <button className={page === "track" ? "active" : ""} onClick={() => setPage("track")}><ListChecks size={18}/>Track</button>
      <button className={page === "chat" ? "active" : ""} onClick={() => setPage("chat")}><MessageCircle size={18}/>Chat</button>
    </nav>
  </main>;
}

function CaseChat({ incident, role, name }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [sentNotice, setSentNotice] = useState("");
  function mergeMessages(current, incoming) {
    const merged = new Map(current.map(message => [message.id, message]));
    incoming.forEach(message => merged.set(message.id, message));
    return [...merged.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  async function refresh() {
    try { const response = await apiFetch(`${API_BASE}/incidents/${incident.id}/messages`); const rows = await response.json(); setMessages(current => mergeMessages(current, rows)); } catch {}
  }
  useEffect(() => {
    const stream = new EventSource(`${API_BASE}/incidents/${incident.id}/messages/stream`);
    stream.addEventListener("message", event => { try { const message = JSON.parse(event.data); setMessages(current => mergeMessages(current, [message])); } catch {} });
    refresh(); const timer = setInterval(refresh, 15000);
    return () => { stream.close(); clearInterval(timer); };
  }, [incident.id]);
  async function send(event) {
    event.preventDefault(); if (!body.trim()) return;
    const response = await apiFetch(`${API_BASE}/incidents/${incident.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author_role: role, author_name: name, body }) });
    if (response.ok) { const message = await response.json(); setMessages(current => mergeMessages(current, [message])); setBody(""); setSentNotice("Message sent"); setTimeout(() => setSentNotice(""), 2500); }
  }
  return <section className="caseChat"><div className="rowBetween"><h3>Chat about this case</h3><span>{incident.assignee ? `Agency: ${incident.assignee}` : "Awaiting agency assignment"}</span></div><div className="chatMessages">{messages.length ? messages.map(message => <article key={message.id} className={message.author_role === role ? "chatMessage own" : "chatMessage"}><strong>{message.author_name} <small>{message.author_role}</small></strong><p>{message.body}</p><time>{new Date(message.created_at).toLocaleString()}</time></article>) : <p className="chatEmpty">Start a conversation about this incident. Messages are visible to the client and assigned agency.</p>}</div><form onSubmit={send}><input value={body} onChange={event => setBody(event.target.value)} placeholder="Write a message..." maxLength={3000}/><button disabled={!body.trim()}>Send</button></form>{sentNotice && <div className="sendConfirmation"><CheckCircle2 size={16}/>{sentNotice}</div>}</section>;
}

function App() {
  const { incidents, reports, loading, reload } = useIncidents();
  const pathRole = window.location.pathname.startsWith("/admin") ? "admin" : window.location.pathname.startsWith("/agency") || window.location.pathname.startsWith("/agent") ? "agency" : window.location.pathname.startsWith("/client") ? "client" : null;
  const [user, setUser] = useState(() => { if (!sessionStorage.getItem("eneo-token")) return null; try { return JSON.parse(sessionStorage.getItem("eneo-user")); } catch { return null; } });
  const [authNotice, setAuthNotice] = useState("");
  useLayoutEffect(() => {
    const handleExpiredSession = () => { setUser(null); setAuthNotice("Your session expired or the server restarted. Please sign in again."); };
    window.addEventListener("eneo-session-expired", handleExpiredSession);
    return () => window.removeEventListener("eneo-session-expired", handleExpiredSession);
  }, []);
  function login(nextUser, token) { sessionStorage.setItem("eneo-user", JSON.stringify(nextUser)); sessionStorage.setItem("eneo-token", token); setAuthNotice(""); setUser(nextUser); }
  function logout() { apiFetch(`${API_BASE}/auth/logout`, { method: "POST" }).catch(() => {}); sessionStorage.removeItem("eneo-token"); sessionStorage.removeItem("eneo-user"); setUser(null); }

  if (loading) return <div className="loading">Loading operational data...</div>;

  if (pathRole && (!user || user.role !== pathRole)) return <SignIn role={pathRole} onLogin={login} notice={authNotice}/>;
  return pathRole === "admin" ? (
    <AdminDashboard incidents={incidents} reports={reports} reload={reload} onLogout={logout}/>
  ) : pathRole === "agency" ? (
    <AgencyDashboard incidents={incidents} reload={reload} user={user} onLogout={logout}/>
  ) : pathRole === "client" ? (
    <ClientDashboard incidents={incidents} reports={reports} reload={reload} user={user} onLogout={logout}/>
  ) : (
    <MobileShell incidents={incidents} reports={reports} reload={reload} />
  );
}

createRoot(document.getElementById("root")).render(<App />);

