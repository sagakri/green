import { useEffect, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'

// ── FlyToHandler ──────────────────────────────────────────────
// Must be a child of MapContainer so useMap() has context
function FlyToHandler({ flyToLocation }) {
  const map = useMap()
  const prevLocation = useRef(null)

  useEffect(() => {
    if (!flyToLocation) return

    // Avoid re-flying to the same location
    const key = `${flyToLocation.lat}-${flyToLocation.lon}-${flyToLocation.zoom}`
    if (prevLocation.current === key) return
    prevLocation.current = key

    map.flyTo([flyToLocation.lat, flyToLocation.lon], flyToLocation.zoom || 14, {
      duration: 1.5,
    })
  }, [flyToLocation, map])

  return null
}

// ── Helpers ───────────────────────────────────────────────────
function getPolygonColor(score) {
  if (score < 30) return '#ef4444'
  if (score < 50) return '#f97316'
  if (score < 70) return '#eab308'
  return '#22c55e'
}

function darkenColor(hex) {
  // Simple darkening by reducing each component
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function getTypeEmoji(type) {
  switch (type) {
    case 'park':
      return '🌳'
    case 'mini_garden':
      return '🌸'
    case 'pocket_park':
      return '🪴'
    default:
      return '🌿'
  }
}

function getTypeLabel(type) {
  switch (type) {
    case 'park':
      return 'Парк'
    case 'mini_garden':
      return 'Мини-сад'
    case 'pocket_park':
      return 'Карманный парк'
    default:
      return type || 'Другое'
  }
}

function getPriorityLabel(priority) {
  switch (priority) {
    case 1:
      return '🔴 Высокий'
    case 2:
      return '🟡 Средний'
    case 3:
      return '🟢 Низкий'
    default:
      return '⚪ Н/Д'
  }
}

function getLevelLabel(level) {
  switch (level) {
    case 'CRITICAL':
      return 'Критический'
    case 'LOW':
      return 'Низкий'
    case 'MEDIUM':
      return 'Средний'
    case 'HIGH':
      return 'Высокий'
    default:
      return level || 'Н/Д'
  }
}

// ── Create DivIcon for recommendation markers ─────────────────
function createEmojiIcon(type) {
  const emoji = getTypeEmoji(type)
  return L.divIcon({
    html: `<div style="font-size:28px;line-height:1;text-align:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>`,
    className: 'emoji-marker-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  })
}

// ── Map Component ─────────────────────────────────────────────
function MapView({ 
  districts, 
  recommendations, 
  selectedDistrict, 
  flyToLocation,
  showDistricts,
  showGreenZones,
  greenZones,
  aiRecommendation
}) {
  const bishkekCenter = [42.8746, 74.5698]

  return (
    <MapContainer
      center={bishkekCenter}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* FlyTo handler */}
      <FlyToHandler flyToLocation={flyToLocation} />

      {/* District Polygons */}
      {showDistricts && districts.map((district) => {
        if (
          !district.polygon_coords ||
          !Array.isArray(district.polygon_coords) ||
          district.polygon_coords.length === 0
        ) {
          return null
        }

        const score = district.green_score || 0
        const fillColor = getPolygonColor(score)
        const borderColor = darkenColor(fillColor)

        return (
          <Polygon
            key={`polygon-${district.id}`}
            positions={district.polygon_coords}
            pathOptions={{
              fillColor: fillColor,
              fillOpacity: 0.35,
              weight: 2,
              color: borderColor,
            }}
          >
            <Popup>
              <div style={{ minWidth: '200px', fontFamily: 'Inter, sans-serif' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#1e293b' }}>
                  {district.name}
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: fillColor,
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '13px',
                    }}
                  >
                    {Math.round(score)}
                  </span>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Уровень: <strong>{getLevelLabel(district.level)}</strong>
                  </span>
                </div>
                {district.recommendation && (
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.4 }}>
                    {district.recommendation}
                  </p>
                )}
              </div>
            </Popup>
          </Polygon>
        )
      })}

      {/* Green Zones Polygons */}
      {showGreenZones && greenZones && greenZones.map((zone) => {
        if (
          !zone.polygon_coords ||
          !Array.isArray(zone.polygon_coords) ||
          zone.polygon_coords.length === 0
        ) {
          return null
        }

        return (
          <Polygon
            key={`greenzone-${zone.id}`}
            positions={zone.polygon_coords}
            pathOptions={{
              fillColor: '#10b981', // emerald-500
              fillOpacity: 0.5,
              weight: 2,
              color: '#059669', // emerald-600
              dashArray: '4', // dashed border for distinction
            }}
          >
            <Popup>
              <div style={{ minWidth: '150px', fontFamily: 'Inter, sans-serif' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: '#10b981' }}>
                  {zone.name}
                </h3>
                <span style={{ fontSize: '12px', color: '#475569' }}>
                  {zone.type}
                </span>
              </div>
            </Popup>
          </Polygon>
        )
      })}

      {/* Recommendation Markers */}
      {recommendations.map((rec, index) => {
        const lat = rec.lat || rec.latitude
        const lon = rec.lon || rec.longitude

        if (!lat || !lon) return null

        return (
          <Marker
            key={`marker-${rec.id || index}`}
            position={[lat, lon]}
            icon={createEmojiIcon(rec.suggested_type)}
          >
            <Popup>
              <div style={{ minWidth: '200px', fontFamily: 'Inter, sans-serif' }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '15px', color: '#1e293b' }}>
                  {rec.address || rec.location || 'Рекомендация'}
                </h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      background: 'rgba(34,197,94,0.15)',
                      color: '#16a34a',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {getTypeEmoji(rec.suggested_type)} {getTypeLabel(rec.suggested_type)}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      background: 'rgba(100,116,139,0.15)',
                      color: '#475569',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {getPriorityLabel(rec.priority)}
                  </span>
                </div>
                {rec.reason && (
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.4 }}>
                    {rec.reason}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}

      {/* AI Recommendation Marker */}
      {aiRecommendation && aiRecommendation.lat && aiRecommendation.lon && (
        <Marker
          position={[aiRecommendation.lat, aiRecommendation.lon]}
          icon={L.divIcon({
            html: `<div style="font-size:32px;line-height:1;text-align:center;filter:drop-shadow(0 0 10px rgba(16,185,129,0.8));">✨${getTypeEmoji(aiRecommendation.suggested_type)}</div>`,
            className: 'emoji-marker-icon-ai',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -22],
          })}
        >
          <Popup>
            <div style={{ minWidth: '220px', fontFamily: 'Inter, sans-serif' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>🤖</span>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#10b981', fontWeight: 600 }}>
                  Решение ИИ-аналитика
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span
                  style={{
                    fontSize: '12px',
                    background: 'rgba(34,197,94,0.15)',
                    color: '#16a34a',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 500
                  }}
                >
                  {getTypeLabel(aiRecommendation.suggested_type)}
                </span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#334155', margin: 0, lineHeight: 1.5 }}>
                {aiRecommendation.reason}
              </p>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  )
}

export default MapView
