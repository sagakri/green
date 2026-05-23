import { useState, useRef } from 'react'
import DistrictCard from './DistrictCard.jsx'
import RecommendationCard from './RecommendationCard.jsx'

function Sidebar({
  districts,
  recommendations,
  selectedDistrict,
  onSelectDistrict,
  onShowOnMap,
  showDistricts,
  setShowDistricts,
  showGreenZones,
  setShowGreenZones,
  greenZonesCount,
  setAiRecommendation,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState('gemini')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const recommendationsRef = useRef(null)

  // Filter districts by search query
  const filteredDistricts = districts.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate stats
  const totalDistricts = districts.length
  const averageScore =
    districts.length > 0
      ? (
          districts.reduce((sum, d) => sum + (d.green_score || 0), 0) /
          districts.length
        ).toFixed(1)
      : 0
  const criticalCount = districts.filter(
    (d) => d.level === 'CRITICAL' || (d.green_score && d.green_score < 30)
  ).length

  // Top 3 recommendations sorted by priority (1 = highest)
  const topRecommendations = [...recommendations]
    .sort((a, b) => (a.priority || 3) - (b.priority || 3))
    .slice(0, 3)

  const scrollToRecommendations = () => {
    if (recommendationsRef.current) {
      recommendationsRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleAiAnalyze = async () => {
    if (!selectedDistrict) {
      alert("Пожалуйста, выберите район для анализа")
      return
    }
    
    setIsAiLoading(true)
    try {
      // In a real app we might use axios, using fetch here for simplicity
      const response = await fetch('http://localhost:8000/api/ai-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          district_id: selectedDistrict.id,
          api_key: apiKey,
          provider: aiProvider
        })
      })
      
      const data = await response.json()
      if (data.status === 'success') {
        setAiRecommendation(data)
        // Auto show on map
        onShowOnMap(data.lat, data.lon)
      } else {
        alert("Ошибка анализа: " + (data.detail || "Неизвестная ошибка"))
      }
    } catch (err) {
      alert("Ошибка сети при обращении к ИИ: " + err.message)
    } finally {
      setIsAiLoading(false)
    }
  }

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>🌿</span>
          <span>GreenWind AI</span>
        </div>
        <div className="sidebar-subtitle">
          AI-анализ озеленения Бишкека
        </div>
        <input
          type="text"
          className="search-box"
          placeholder="🔍 Поиск района..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="find-parks-btn" onClick={scrollToRecommendations}>
          🌳 Найти лучшие места для парка
        </button>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <div className="stat-value">{totalDistricts}</div>
          <div className="stat-label">Районов</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{averageScore}</div>
          <div className="stat-label">Средний балл</div>
        </div>
        <div className="stat-item">
          <div className="stat-value" style={{ color: criticalCount > 0 ? '#ef4444' : '#22c55e' }}>
            {criticalCount}
          </div>
          <div className="stat-label">Критических</div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>Слои карты</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '13px', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={showDistricts} 
            onChange={(e) => setShowDistricts(e.target.checked)} 
            style={{ accentColor: 'var(--green-primary)' }}
          />
          Показывать границы районов
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={showGreenZones} 
            onChange={(e) => setShowGreenZones(e.target.checked)} 
            style={{ accentColor: 'var(--green-primary)' }}
          />
          Существующие зеленые зоны ({greenZonesCount})
        </label>
      </div>

      {/* AI Assistant Panel */}
      <div className="ai-panel" style={{ padding: '15px 20px', borderBottom: '1px solid var(--border-color)', background: 'linear-gradient(to right, rgba(30,41,59,0.8), rgba(15,76,45,0.3))' }}>
        <div style={{ fontWeight: 600, marginBottom: '10px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🤖</span> ИИ-аналитик
        </div>
        
        {selectedDistrict ? (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Выбран: <strong>{selectedDistrict.name}</strong>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px' }}>
            Сначала выберите район из списка
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <select 
            value={aiProvider} 
            onChange={(e) => setAiProvider(e.target.value)}
            style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', color: 'white', border: '1px solid var(--border-color)', fontSize: '12px', flex: 1 }}
          >
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
          </select>
          <input 
            type="password" 
            placeholder="API Ключ (опционально)" 
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', color: 'white', border: '1px solid var(--border-color)', fontSize: '12px', flex: 2 }}
          />
        </div>
        <button 
          onClick={handleAiAnalyze} 
          disabled={!selectedDistrict || isAiLoading}
          style={{ 
            width: '100%', padding: '8px', borderRadius: '6px', 
            background: (!selectedDistrict || isAiLoading) ? 'var(--bg-card)' : 'var(--green-primary)', 
            color: 'white', border: 'none', cursor: (!selectedDistrict || isAiLoading) ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: 500, transition: '0.2s'
          }}
        >
          {isAiLoading ? '⏳ Анализируем...' : '🧠 Запросить ИИ-анализ'}
        </button>
      </div>

      {/* District Cards List */}
      <div className="districts-list">
        {filteredDistricts.map((district) => (
          <DistrictCard
            key={district.id}
            district={district}
            isSelected={selectedDistrict && selectedDistrict.id === district.id}
            onSelect={onSelectDistrict}
          />
        ))}

        {filteredDistricts.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              padding: '40px 20px',
              fontSize: '14px',
            }}
          >
            Районы не найдены
          </div>
        )}

        {/* Recommendations Section */}
        <div ref={recommendationsRef} className="recommendations-section">
          <div className="section-title">
            <span>🏆</span>
            <span>Топ рекомендации</span>
          </div>
          {topRecommendations.map((rec, index) => (
            <RecommendationCard
              key={rec.id || index}
              recommendation={rec}
              onShowOnMap={onShowOnMap}
            />
          ))}
          {topRecommendations.length === 0 && (
            <div
              style={{
                color: 'var(--text-secondary)',
                fontSize: '13px',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              Нет рекомендаций
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
