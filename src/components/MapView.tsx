// MapView: one small map for everything the dashboard needs to show on the
// ground — a job's pin and its geofence circle, a shift's route, and (when
// onPick is given) a click to place or move a pin.
//
// Leaflet with OpenStreetMap tiles: no API key, no billing. Markers are
// drawn as vector circles (no image files), so they take the theme's colours
// and survive the bundler.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapPoint = { lat: number; lon: number; kind: 'job' | 'in' | 'out' | 'ping' | 'outside'; label?: string };

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function MapView({ points, path, circle, onPick, height = 320 }: {
    points: MapPoint[];
    /** The route, in time order. */
    path?: [number, number][];
    /** The geofence. */
    circle?: { lat: number; lon: number; radius: number };
    /** Click on the map → a new pin position. */
    onPick?: (lat: number, lon: number) => void;
    height?: number;
}) {
    const el = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const layer = useRef<L.LayerGroup | null>(null);
    const pick = useRef(onPick);
    pick.current = onPick;

    // The map itself, once.
    useEffect(() => {
        if (!el.current) return;
        const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([56, -96], 3);   // Canada, until there is something to show
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
        layer.current = L.layerGroup().addTo(m);
        m.on('click', e => pick.current?.(e.latlng.lat, e.latlng.lng));
        map.current = m;
        // Inside a dialog the container gets its size a frame late.
        const t = window.setTimeout(() => m.invalidateSize(), 60);
        return () => { window.clearTimeout(t); m.remove(); map.current = null; };
    }, []);

    // What is on it.
    useEffect(() => {
        const m = map.current, g = layer.current;
        if (!m || !g) return;
        g.clearLayers();
        const accent = css('--accent') || '#2F6BEB', live = css('--live') || '#1FA254', danger = css('--danger') || '#D13B3B', plan = css('--plan') || '#6D4FE0', ink = css('--ink-muted') || '#5C6470';
        const bounds: L.LatLngExpression[] = [];
        if (circle) { L.circle([circle.lat, circle.lon], { radius: circle.radius, color: plan, weight: 1.5, fillColor: plan, fillOpacity: 0.08 }).addTo(g); }
        if (path && path.length > 1) { L.polyline(path, { color: accent, weight: 3, opacity: 0.85 }).addTo(g); }
        for (const p of points) {
            const style = p.kind === 'job' ? { radius: 9, color: '#fff', weight: 2, fillColor: plan, fillOpacity: 1 }
                : p.kind === 'in' ? { radius: 8, color: '#fff', weight: 2, fillColor: live, fillOpacity: 1 }
                : p.kind === 'out' ? { radius: 8, color: '#fff', weight: 2, fillColor: danger, fillOpacity: 1 }
                : p.kind === 'outside' ? { radius: 5, color: danger, weight: 2, fillColor: '#fff', fillOpacity: 1 }
                : { radius: 4, color: '#fff', weight: 1, fillColor: ink, fillOpacity: 0.9 };
            const mk = L.circleMarker([p.lat, p.lon], style).addTo(g);
            if (p.label) mk.bindTooltip(p.label);
            bounds.push([p.lat, p.lon]);
        }
        if (circle) { const c = L.latLng(circle.lat, circle.lon).toBounds(circle.radius * 2.4); bounds.push(c.getNorthEast(), c.getSouthWest()); }
        if (bounds.length === 1) m.setView(bounds[0], 16);
        else if (bounds.length > 1) m.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 17 });
    }, [points, path, circle]);

    return <div ref={el} className={'map' + (onPick ? ' map-pick' : '')} style={{ height }} />;
}
