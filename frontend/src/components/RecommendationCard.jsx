function RecommendationCard({ recommendation, onShowOnMap }) {
  const rec = recommendation

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

  return (
    <div className="recommendation-card">
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
      {rec.reason && <div className="rec-reason">{rec.reason}</div>}
      <button className="show-on-map-btn" onClick={handleShowOnMap}>
        📍 Показать на карте
      </button>
    </div>
  )
}

export default RecommendationCard
