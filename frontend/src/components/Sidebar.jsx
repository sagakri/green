import { useState, useRef } from 'react'
import axios from 'axios'
import DistrictCard from './DistrictCard.jsx'
import RecommendationCard from './RecommendationCard.jsx'

const API_BASE = 'http://localhost:8000'

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
  onGenerateRecommendations,
  onAiAnalyzeSuccess,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState('gemini')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState('districts') // 'districts' | 'recommendations' | 'report'
  const [aiRunCount, setAiRunCount] = useState(0) // for forcing re-analysis
  const recommendationsRef = useRef(null)

  // Sort districts by green_score ascending (lowest score = highest priority)
  const sortedDistricts = [...districts].sort((a, b) => (a.green_score || 0) - (b.green_score || 0))

  // Filter sorted districts by search query
  const filteredDistricts = sortedDistricts.filter((d) =>
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

  // Top recommendations sorted by priority
  const topRecommendations = [...recommendations]
    .sort((a, b) => (a.priority || 3) - (b.priority || 3))
    .slice(0, 4)

  const handleGenerateClick = async () => {
    setIsGenerating(true)
    try {
      if (onGenerateRecommendations) {
        await onGenerateRecommendations()
        setActiveTab('recommendations')
      }
    } catch (err) {
      alert("Ошибка при поиске мест: " + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleAiAnalyze = async () => {
    if (!selectedDistrict) {
      alert("Пожалуйста, выберите район для анализа")
      return
    }
    
    setIsAiLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district_id: selectedDistrict.id,
          api_key: apiKey,
          provider: aiProvider,
          run_index: aiRunCount // pass to backend so it can vary results
        })
      })
      
      const data = await response.json()
      if (data.status === 'success') {
        setAiRecommendation(data)
        onShowOnMap(data.lat, data.lon)
        setAiRunCount(prev => prev + 1)
        
        if (onAiAnalyzeSuccess) {
          await onAiAnalyzeSuccess()
        }
        // Auto switch to recommendations tab
        setActiveTab('recommendations')
      } else {
        alert("Ошибка анализа: " + (data.detail || "Неизвестная ошибка"))
      }
    } catch (err) {
      alert("Ошибка сети при обращении к ИИ: " + err.message)
    } finally {
      setIsAiLoading(false)
    }
  }

  // ── Text report generation (replaces broken PDF) ──
  const handleDownloadReport = async () => {
    if (!selectedDistrict) {
      alert("Выберите район для генерации отчёта")
      return
    }

    try {
      const res = await axios.get(`${API_BASE}/api/recommendations?t=${Date.now()}`)
      const freshRecs = res.data
      const top = [...freshRecs].sort((a, b) => (a.priority || 3) - (b.priority || 3)).slice(0, 4)

      // Fetch details for each recommendation
      const detailsArr = []
      for (const rec of top) {
        if (rec.id) {
          try {
            const detRes = await axios.get(`${API_BASE}/api/recommendation-details/${rec.id}`)
            detailsArr.push(detRes.data)
          } catch { detailsArr.push(null) }
        }
      }

      const d = selectedDistrict
      const date = new Date().toLocaleDateString('ru-RU')
      const divider = '═'.repeat(60)
      const thinDiv = '─'.repeat(60)

      let text = ''
      text += `${divider}\n`
      text += `  🌿 GreenWind AI — Аналитический отчёт\n`
      text += `${divider}\n`
      text += `Дата: ${date}\n`
      text += `Город: Бишкек, Кыргызская Республика\n\n`

      text += `${thinDiv}\n`
      text += `  📍 РАЙОН: ${d.name}\n`
      text += `${thinDiv}\n`
      text += `  Площадь:                 ${d.area_km2} км²\n`
      text += `  Население:               ${d.population?.toLocaleString('ru-RU')} чел.\n`
      text += `  Плотность населения:     ${Math.round(d.population / d.area_km2)} чел/км²\n`
      text += `  Плотность застройки:     ${Math.round((d.building_density || 0) * 100)}%\n`
      text += `  Ср. расстояние до парка: ${d.avg_distance_to_park_m} м\n`
      text += `  Количество парков:       ${d.park_count}\n`
      text += `  Зелёная площадь:         ${d.green_area_m2?.toLocaleString('ru-RU')} м²\n`
      text += `  Green Score:             ${d.green_score} / 100\n`
      text += `  Уровень:                 ${d.level}\n`
      text += `  Рекомендация:            ${d.recommendation}\n\n`

      text += `${divider}\n`
      text += `  🏆 ТОП-РЕКОМЕНДАЦИИ ИИ-АНАЛИТИКА\n`
      text += `${divider}\n\n`

      if (top.length === 0) {
        text += `  Рекомендации ещё не сгенерированы.\n`
        text += `  Нажмите "Запросить ИИ-анализ" для получения рекомендаций.\n\n`
      }

      top.forEach((rec, i) => {
        const typeLabels = { park: 'Парк', pocket_park: 'Карманный парк', mini_garden: 'Мини-сад' }
        const prioLabels = { 1: '🔴 ВЫСОКИЙ', 2: '🟡 СРЕДНИЙ', 3: '🟢 НИЗКИЙ' }
        
        text += `  ┌─── Локация #${i + 1} ───────────────────────────────\n`
        text += `  │ Адрес:        ${rec.address || 'Не указан'}\n`
        text += `  │ Тип объекта:  ${typeLabels[rec.suggested_type] || rec.suggested_type || 'Другое'}\n`
        text += `  │ Приоритет:    ${prioLabels[rec.priority] || 'Н/Д'}\n`
        text += `  │ Координаты:   ${rec.lat?.toFixed(5)}, ${rec.lon?.toFixed(5)}\n`

        // Strip HTML from reason
        const cleanReason = (rec.reason || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
        if (cleanReason) {
          text += `  │ Обоснование:  ${cleanReason.substring(0, 200)}\n`
        }

        const det = detailsArr[i]
        if (det) {
          text += `  │\n`
          text += `  │ 📊 КОНТЕКСТ ЛОКАЦИИ:\n`
          text += `  │   Ближайший парк:      ${det.nearest_park_name} (${det.nearest_park_distance_m} м)\n`
          text += `  │   Зелень на человека:   ${det.green_per_person_m2} м² (норма ВОЗ: 15 м²)\n`
          text += `  │   Дефицит по ВОЗ:       ${det.who_deficit_m2} м²/чел.\n`
          text += `  │   Застройка:            ${det.building_density}%\n`
          text += `  │\n`
          text += `  │ 📈 ПРОГНОЗ (ДО → ПОСЛЕ):\n`
          text += `  │   Green Score СЕЙЧАС:   ${det.current_green_score}\n`
          text += `  │   Green Score ПОСЛЕ:    ${det.forecasted_green_score}\n`
          text += `  │   УЛУЧШЕНИЕ:            +${det.score_improvement}\n`
          text += `  │   Добавляемая площадь:  ${(det.added_green_area_m2 / 10000).toFixed(1)} га\n`
        }
        text += `  └───────────────────────────────────────────\n\n`
      })

      text += `${divider}\n`
      text += `  Отчёт сгенерирован автоматически системой GreenWind AI\n`
      text += `  © 2026 GreenWind AI — Анализ озеленения Бишкека\n`
      text += `${divider}\n`

      // Download as .txt file
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `GreenWind_Report_${d.name}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

    } catch (err) {
      console.error('Report generation error:', err)
      alert('Ошибка генерации отчёта: ' + err.message)
    }
  }

  // ── Tab styles ──
  const tabStyle = (isActive) => ({
    flex: 1,
    padding: '8px 4px',
    fontSize: '11px',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#10b981' : '#94a3b8',
    background: isActive ? 'rgba(16,185,129,0.1)' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
    cursor: 'pointer',
    transition: '0.2s',
    fontFamily: 'inherit'
  })

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

      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
        <button style={tabStyle(activeTab === 'districts')} onClick={() => setActiveTab('districts')}>
          📋 Районы
        </button>
        <button style={tabStyle(activeTab === 'recommendations')} onClick={() => setActiveTab('recommendations')}>
          🏆 Рекомендации
        </button>
        <button style={tabStyle(activeTab === 'ai')} onClick={() => setActiveTab('ai')}>
          🤖 ИИ-анализ
        </button>
      </div>

      {/* ═══ Tab Content ═══ */}
      <div className="districts-list">
        
        {/* ── Districts Tab ── */}
        {activeTab === 'districts' && (
          <>
            <div style={{ padding: '0 0 8px' }}>
              <input
                type="text"
                className="search-box"
                placeholder="🔍 Поиск района..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ marginTop: 0 }}
              />
            </div>

            {/* Layer toggles */}
            <div style={{ padding: '8px 4px', marginBottom: '4px', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={showDistricts} onChange={(e) => setShowDistricts(e.target.checked)} style={{ accentColor: 'var(--green-primary)' }} />
                Границы районов
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={showGreenZones} onChange={(e) => setShowGreenZones(e.target.checked)} style={{ accentColor: 'var(--green-primary)' }} />
                Зелёные зоны ({greenZonesCount})
              </label>
            </div>

            {filteredDistricts.map((district) => {
              const rank = sortedDistricts.findIndex(d => d.id === district.id) + 1;
              return (
                <DistrictCard
                  key={district.id}
                  district={district}
                  rank={rank}
                  isSelected={selectedDistrict && selectedDistrict.id === district.id}
                  onSelect={(d) => { onSelectDistrict(d); setActiveTab('ai'); }}
                />
              );
            })}

            {filteredDistricts.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px', fontSize: '14px' }}>
                Районы не найдены
              </div>
            )}
          </>
        )}

        {/* ── Recommendations Tab ── */}
        {activeTab === 'recommendations' && (
          <>
            <div style={{ padding: '8px 0' }}>
              <button 
                className="find-parks-btn" 
                onClick={handleGenerateClick}
                disabled={isGenerating}
                style={{ opacity: isGenerating ? 0.7 : 1, marginTop: 0 }}
              >
                {isGenerating ? '⏳ Поиск слепых зон...' : '🌳 Найти лучшие места для парка'}
              </button>
            </div>

            <div ref={recommendationsRef} className="recommendations-section" style={{ borderTop: 'none', paddingTop: '4px' }}>
              <div className="section-title">
                <span>🏆</span>
                <span>Топ рекомендации ({topRecommendations.length})</span>
              </div>
              {topRecommendations.map((rec, index) => (
                <RecommendationCard
                  key={`${rec.id}-${aiRunCount}-${index}`}
                  recommendation={rec}
                  onShowOnMap={onShowOnMap}
                />
              ))}
              {topRecommendations.length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                  Нажмите «Найти лучшие места» или запустите ИИ-анализ
                </div>
              )}
            </div>

            {/* Download Report Button */}
            {topRecommendations.length > 0 && (
              <button
                onClick={handleDownloadReport}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #334155, #1e293b)',
                  color: '#e2e8f0', border: '1px solid var(--border-color)',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                  fontFamily: 'inherit', transition: '0.2s', marginTop: '8px'
                }}
              >
                📄 Скачать текстовый отчёт
              </button>
            )}
          </>
        )}

        {/* ── AI Analysis Tab ── */}
        {activeTab === 'ai' && (
          <>
            <div style={{ padding: '12px 4px', background: 'linear-gradient(to bottom, rgba(15,76,45,0.15), transparent)', borderRadius: '8px', marginBottom: '8px' }}>
              <div style={{ fontWeight: 600, marginBottom: '10px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🤖</span> ИИ-аналитик
              </div>
              
              {selectedDistrict ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', padding: '6px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: '6px' }}>
                  Выбран: <strong style={{ color: '#10b981' }}>{selectedDistrict.name}</strong>
                  <span style={{ float: 'right', fontSize: '11px' }}>Score: {selectedDistrict.green_score}</span>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px', padding: '6px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>
                  ← Выберите район на вкладке «Районы»
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <select 
                  value={aiProvider} 
                  onChange={(e) => setAiProvider(e.target.value)}
                  style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', color: 'white', border: '1px solid var(--border-color)', fontSize: '12px', flex: 1, fontFamily: 'inherit' }}
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
                  width: '100%', padding: '10px', borderRadius: '6px', 
                  background: (!selectedDistrict || isAiLoading) ? 'var(--bg-card)' : 'linear-gradient(135deg, #22c55e, #16a34a)', 
                  color: 'white', border: 'none', cursor: (!selectedDistrict || isAiLoading) ? 'not-allowed' : 'pointer',
                  fontSize: '13px', fontWeight: 600, transition: '0.2s', fontFamily: 'inherit'
                }}
              >
                {isAiLoading ? '⏳ Анализируем...' : aiRunCount > 0 ? '🔄 Повторный ИИ-анализ (новые локации)' : '🧠 Запросить ИИ-анализ'}
              </button>

              {aiRunCount > 0 && (
                <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '6px' }}>
                  Запросов выполнено: {aiRunCount}. Каждый запрос — новые уникальные локации.
                </div>
              )}
            </div>

            {/* Show current recommendations in AI tab too */}
            {topRecommendations.length > 0 && (
              <div>
                <div className="section-title" style={{ fontSize: '14px' }}>
                  <span>🏆</span>
                  <span>Результаты анализа ({topRecommendations.length})</span>
                </div>
                {topRecommendations.map((rec, index) => (
                  <RecommendationCard
                    key={`ai-${rec.id}-${aiRunCount}-${index}`}
                    recommendation={rec}
                    onShowOnMap={onShowOnMap}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
