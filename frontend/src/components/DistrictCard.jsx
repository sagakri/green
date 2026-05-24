function DistrictCard({ district, isSelected, onSelect, rank }) {
  const score = district.green_score || 0

  // Score circle color
  const getScoreColor = (s) => {
    if (s < 30) return '#ef4444'
    if (s < 50) return '#f97316'
    if (s < 70) return '#eab308'
    return '#22c55e'
  }

  // Level badge class and label
  const getLevelInfo = (level) => {
    switch (level) {
      case 'CRITICAL':
        return { className: 'level-critical', label: 'Критический' }
      case 'LOW':
        return { className: 'level-low', label: 'Низкий' }
      case 'MEDIUM':
        return { className: 'level-medium', label: 'Средний' }
      case 'HIGH':
        return { className: 'level-high', label: 'Высокий' }
      default:
        return { className: 'level-medium', label: level || 'Н/Д' }
    }
  }

  const scoreColor = getScoreColor(score)
  const levelInfo = getLevelInfo(district.level)

  return (
    <div
      className={`district-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(district)}
    >
      <div className="district-card-header">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          {rank && (
            <div style={{
              background: rank === 1 ? '#ef4444' : rank === 2 ? '#f97316' : rank === 3 ? '#eab308' : '#64748b',
              color: 'white',
              fontSize: '11px',
              fontWeight: 'bold',
              padding: '2px 6px',
              borderRadius: '4px',
              marginTop: '2px'
            }}>
              #{rank}
            </div>
          )}
          <div>
            <div className="district-name">{district.name}</div>
            <div style={{ marginTop: '4px' }}>
              <span className={`level-badge ${levelInfo.className}`}>
                {levelInfo.label}
              </span>
            </div>
          </div>
        </div>
        <div
          className="score-circle"
          style={{ backgroundColor: scoreColor }}
        >
          {Math.round(score)}
        </div>
      </div>

      {district.recommendation && (
        <div className="district-recommendation">
          {district.recommendation}
        </div>
      )}

      <div className="district-meta">
        {district.population && (
          <span>👥 {district.population.toLocaleString('ru-RU')} чел.</span>
        )}
        {district.area_km2 && <span>📐 {district.area_km2} км²</span>}
      </div>
    </div>
  )
}

export default DistrictCard
