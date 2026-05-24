import { useState } from 'react'
import axios from 'axios'

const API_BASE = 'http://localhost:8000'

function RecommendationCard({ recommendation, onShowOnMap }) {
  const rec = recommendation
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(false)

  // Type icon and Russian label
  const getTypeInfo = (type) => {
    switch (type) {
      case 'park':
        return { icon: '🌳', label: 'Парк' }
      case 'mini_garden':
        return { icon: '🌸', label: 'Мини-сад' }
      case 'pocket_park':
        return { icon: '🪴', label: 'Карманный парк' }
      default:
        return { icon: '🌿', label: type || 'Другое' }
    }
  }

  // Priority info
  const getPriorityInfo = (priority) => {
    switch (priority) {
      case 1:
        return { icon: '🔴', label: 'Высокий', className: 'priority-1' }
      case 2:
        return { icon: '🟡', label: 'Средний', className: 'priority-2' }
      case 3:
        return { icon: '🟢', label: 'Низкий', className: 'priority-3' }
      default:
        return { icon: '⚪', label: 'Н/Д', className: 'priority-3' }
    }
  }

  const typeInfo = getTypeInfo(rec.suggested_type)
  const priorityInfo = getPriorityInfo(rec.priority)

  const handleShowOnMap = () => {
    if (rec.lat && rec.lon) {
      onShowOnMap(rec.lat, rec.lon)
    } else if (rec.latitude && rec.longitude) {
      onShowOnMap(rec.latitude, rec.longitude)
    }
  }

  const handleToggleDetails = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    
    if (!details && rec.id) {
      setLoading(true)
      try {
        const res = await axios.get(`${API_BASE}/api/recommendation-details/${rec.id}`)
        setDetails(res.data)
      } catch (err) {
        console.error('Ошибка загрузки аналитики:', err)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
  }

  // Score bar color
  const getScoreBarColor = (score) => {
    if (score < 30) return '#ef4444'
    if (score < 50) return '#f97316'
    if (score < 70) return '#eab308'
    return '#22c55e'
  }

  return (
    <div className="recommendation-card" style={{ transition: 'all 0.3s ease' }}>
      <div className="rec-address">
        {rec.address || rec.location || 'Адрес не указан'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        <span className="rec-type">
          {typeInfo.icon} {typeInfo.label}
        </span>
        <span className={`rec-priority ${priorityInfo.className}`}>
          {priorityInfo.icon} {priorityInfo.label}
        </span>
      </div>
      {rec.reason && (
        <div 
          className="rec-reason" 
          dangerouslySetInnerHTML={{ __html: rec.reason }} 
        />
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
        <button className="show-on-map-btn" onClick={handleShowOnMap} style={{ flex: 1 }}>
          📍 На карте
        </button>
        <button 
          className="show-on-map-btn" 
          onClick={handleToggleDetails}
          style={{ 
            flex: 1,
            background: expanded ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
            color: expanded ? '#ef4444' : '#818cf8'
          }}
        >
          {loading ? '⏳ ...' : expanded ? '✕ Скрыть' : '📊 Аналитика'}
        </button>
      </div>

      {/* ── Expanded Analytics Panel ── */}
      {expanded && details && (
        <div style={{
          marginTop: '10px',
          padding: '12px',
          background: 'rgba(15,23,42,0.6)',
          borderRadius: '8px',
          border: '1px solid rgba(99,102,241,0.3)',
          animation: 'fadeIn 0.3s ease'
        }}>
          {/* WHY this location */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: '#c084fc', marginBottom: '6px' }}>
              🎯 Почему это место выбрано
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
              <div style={statBoxStyle}>
                <span style={statLabelStyle}>👥 Население района</span>
                <span style={statValueStyle}>{details.population?.toLocaleString('ru-RU')} чел.</span>
              </div>
              <div style={statBoxStyle}>
                <span style={statLabelStyle}>📊 Плотность</span>
                <span style={statValueStyle}>{details.population_density?.toLocaleString('ru-RU')} чел/км²</span>
              </div>
              <div style={statBoxStyle}>
                <span style={statLabelStyle}>🏗️ Застройка</span>
                <span style={statValueStyle}>{details.building_density}%</span>
              </div>
              <div style={statBoxStyle}>
                <span style={statLabelStyle}>🌿 Зелень/чел.</span>
                <span style={{ ...statValueStyle, color: details.green_per_person_m2 < 9 ? '#ef4444' : '#10b981' }}>
                  {details.green_per_person_m2} м²
                </span>
              </div>
            </div>
          </div>

          {/* Nearest park */}
          <div style={{ marginBottom: '12px', fontSize: '12px' }}>
            <div style={statBoxStyle}>
              <span style={statLabelStyle}>🏞️ Ближайший парк</span>
              <span style={statValueStyle}>
                {details.nearest_park_name} — <strong style={{ color: details.nearest_park_distance_m > 800 ? '#ef4444' : '#10b981' }}>
                  {details.nearest_park_distance_m} м
                </strong>
              </span>
            </div>
          </div>

          {/* WHO deficit */}
          {details.who_deficit_m2 > 0 && (
            <div style={{
              padding: '6px 10px', borderRadius: '6px', marginBottom: '12px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              fontSize: '11px', color: '#fca5a5'
            }}>
              ⚠️ Дефицит по нормам ВОЗ: <strong>{details.who_deficit_m2} м²</strong> зелени на человека
            </div>
          )}

          {/* Type recommendation */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: '#34d399', marginBottom: '6px' }}>
              🏗️ Рекомендуемый тип объекта
            </div>
            <div style={{
              padding: '8px 10px', borderRadius: '6px',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
              fontSize: '12px', color: '#a7f3d0'
            }}>
              <strong>{details.type_label}</strong>
              <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '11px' }}>
                {details.type_reason}
              </div>
            </div>
          </div>

          {/* ── BEFORE / AFTER FORECAST ── */}
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: '#60a5fa', marginBottom: '8px' }}>
              📈 Прогноз: до и после
            </div>
            
            {/* Before bar */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                <span style={{ color: '#94a3b8' }}>Сейчас</span>
                <span style={{ color: getScoreBarColor(details.current_green_score), fontWeight: 600 }}>
                  {details.current_green_score}
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(30,41,59,0.8)' }}>
                <div style={{
                  width: `${details.current_green_score}%`,
                  height: '100%',
                  borderRadius: '4px',
                  background: getScoreBarColor(details.current_green_score),
                  transition: 'width 1s ease'
                }} />
              </div>
            </div>

            {/* After bar */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                <span style={{ color: '#94a3b8' }}>После</span>
                <span style={{ color: getScoreBarColor(details.forecasted_green_score), fontWeight: 600 }}>
                  {details.forecasted_green_score}
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(30,41,59,0.8)' }}>
                <div style={{
                  width: `${details.forecasted_green_score}%`,
                  height: '100%',
                  borderRadius: '4px',
                  background: `linear-gradient(90deg, ${getScoreBarColor(details.current_green_score)}, ${getScoreBarColor(details.forecasted_green_score)})`,
                  transition: 'width 1s ease'
                }} />
              </div>
            </div>

            {/* Improvement badge */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '8px', padding: '6px 10px', borderRadius: '6px',
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)'
            }}>
              <span style={{ fontSize: '11px', color: '#86efac' }}>
                Улучшение Green Score
              </span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e' }}>
                +{details.score_improvement}
              </span>
            </div>

            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
              При добавлении {(details.added_green_area_m2 / 10000).toFixed(1)} га зелёной зоны
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const statBoxStyle = {
  padding: '6px 8px',
  borderRadius: '6px',
  background: 'rgba(30,41,59,0.6)',
  border: '1px solid rgba(100,116,139,0.2)',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
}

const statLabelStyle = {
  fontSize: '10px',
  color: '#94a3b8',
}

const statValueStyle = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#e2e8f0',
}

export default RecommendationCard
