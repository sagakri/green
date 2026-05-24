import React from 'react'

const ReportTemplate = ({ district, aiRecommendations, mapImage }) => {
  if (!district) return null

  // Helper to format date
  const date = new Date().toLocaleDateString('ru-RU')

  return (
    <div id="pdf-report-container" style={{ padding: '40px', width: '800px', backgroundColor: 'white', color: 'black', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #10b981', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, color: '#0f4c2d', fontSize: '28px' }}>GreenWind AI</h1>
        <div style={{ textAlign: 'right', fontSize: '14px', color: '#666' }}>
          Дата отчета: {date}<br/>
          Город: Бишкек
        </div>
      </div>

      <h2 style={{ fontSize: '24px', marginBottom: '10px' }}>Анализ озеленения: {district.name}</h2>
      
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <div style={{ flex: 1, backgroundColor: '#f3f4f6', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px', color: '#374151' }}>Статистика района</h3>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4b5563' }}>
            <li>Площадь: <b>{district.area_km2} км²</b></li>
            <li>Население: <b>{district.population} чел.</b></li>
            <li>Ср. расстояние до парка: <b>{district.avg_distance_to_park_m} м</b></li>
            <li>Индекс зелени: <b style={{ color: district.green_score < 40 ? '#ef4444' : '#10b981' }}>{district.green_score}</b> / 100</li>
          </ul>
        </div>
      </div>

      {mapImage && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#1f2937' }}>Карта-схема (Расположение ИИ-точек)</h3>
          <img src={mapImage} alt="Map" style={{ width: '100%', height: 'auto', borderRadius: '8px', border: '1px solid #d1d5db' }} />
        </div>
      )}

      <div>
        <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#1f2937' }}>Топ-рекомендации ИИ-аналитика</h3>
        {aiRecommendations.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {aiRecommendations.map((rec, i) => (
              <div key={rec.id || i} style={{ borderLeft: '4px solid #10b981', paddingLeft: '15px', backgroundColor: '#f8fafc', padding: '10px', borderRadius: '0 8px 8px 0' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#0f4c2d' }}>Локация {i+1}: {rec.suggested_type === 'park' ? 'Парк' : rec.suggested_type === 'pocket_park' ? 'Карманный парк' : 'Мини-сад'}</h4>
                <div style={{ fontSize: '13px', lineHeight: '1.5', color: '#475569' }} dangerouslySetInnerHTML={{ __html: rec.reason }} />
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '14px', color: '#64748b' }}>Рекомендации еще не сгенерированы.</p>
        )}
      </div>

      <div style={{ marginTop: '30px', borderTop: '1px solid #e2e8f0', paddingTop: '15px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
        Отчет сгенерирован автоматически системой GreenWind AI
      </div>
    </div>
  )
}

export default ReportTemplate
