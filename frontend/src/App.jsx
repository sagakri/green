import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import Sidebar from './components/Sidebar.jsx'
import Map from './components/Map.jsx'

const API_BASE = 'http://localhost:8000'

function App() {
  const [districts, setDistricts] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [districtRecommendations, setDistrictRecommendations] = useState([])
  const [flyToLocation, setFlyToLocation] = useState(null)
  
  const [greenZones, setGreenZones] = useState([])
  const [showDistricts, setShowDistricts] = useState(true)
  const [showGreenZones, setShowGreenZones] = useState(false)
  const [aiRecommendation, setAiRecommendation] = useState(null)

  // Fetch districts on mount
  useEffect(() => {
    axios
      .get(`${API_BASE}/api/districts`)
      .then((res) => {
        setDistricts(res.data)
      })
      .catch((err) => {
        console.error('Ошибка загрузки районов:', err)
      })
  }, [])

  // Fetch all recommendations
  const fetchRecommendations = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/recommendations?t=${Date.now()}`)
      setRecommendations(res.data)
    } catch (err) {
      console.error('Ошибка загрузки рекомендаций:', err)
    }
  }

  // Fetch all recommendations on mount
  useEffect(() => {
    fetchRecommendations()
  }, [])

  // Fetch green zones on mount
  useEffect(() => {
    axios
      .get(`${API_BASE}/api/green-zones`)
      .then((res) => {
        setGreenZones(res.data)
      })
      .catch((err) => {
        console.error('Ошибка загрузки зеленых зон:', err)
      })
  }, [])

  // Handle district selection
  const handleSelectDistrict = useCallback(
    (district) => {
      setSelectedDistrict(district)

      // Fly to district center
      if (district.polygon_coords && district.polygon_coords.length > 0) {
        const coords = district.polygon_coords
        const avgLat =
          coords.reduce((sum, c) => sum + c[0], 0) / coords.length
        const avgLon =
          coords.reduce((sum, c) => sum + c[1], 0) / coords.length
        setFlyToLocation({ lat: avgLat, lon: avgLon, zoom: 13 })
      }

      // Fetch recommendations for this district
      if (district.id) {
        axios
          .get(`${API_BASE}/api/recommendations/${district.id}`)
          .then((res) => {
            setDistrictRecommendations(res.data)
          })
          .catch((err) => {
            console.error('Ошибка загрузки рекомендаций района:', err)
          })
      }
    },
    []
  )

  // Handle show on map
  const handleShowOnMap = useCallback((lat, lon) => {
    setFlyToLocation({ lat, lon, zoom: 15 })
  }, [])

  // Handle generating dynamic recommendations
  const handleGenerateRecommendations = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/generate-recommendations`)
      setRecommendations(res.data)
      return res.data
    } catch (err) {
      console.error('Ошибка генерации рекомендаций:', err)
      throw err
    }
  }

  return (
    <div className="app-container">
      <Sidebar
        districts={districts}
        recommendations={recommendations}
        selectedDistrict={selectedDistrict}
        onSelectDistrict={handleSelectDistrict}
        onShowOnMap={handleShowOnMap}
        showDistricts={showDistricts}
        setShowDistricts={setShowDistricts}
        showGreenZones={showGreenZones}
        setShowGreenZones={setShowGreenZones}
        greenZonesCount={greenZones.length}
        setAiRecommendation={setAiRecommendation}
        onGenerateRecommendations={handleGenerateRecommendations}
        onAiAnalyzeSuccess={fetchRecommendations}
      />
      <div className="map-container">
        <Map
          districts={districts}
          recommendations={recommendations}
          selectedDistrict={selectedDistrict}
          flyToLocation={flyToLocation}
          showDistricts={showDistricts}
          showGreenZones={showGreenZones}
          greenZones={greenZones}
          aiRecommendation={aiRecommendation}
        />
      </div>
    </div>
  )
}

export default App
