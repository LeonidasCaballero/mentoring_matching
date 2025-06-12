import React, { useState, useEffect } from 'react';
import './App.css';
import { createClient } from '@supabase/supabase-js';
import confetti from 'canvas-confetti';

// Silenciar logs en producción para evitar ruido en la consola del navegador
if (process.env.NODE_ENV !== 'development') {
  // eslint-disable-next-line no-console
  console.log = () => {};
}

// Variables de Supabase (para desarrollo solamente)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://chbnzgqeuvfbhsbupuin.supabase.co";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYm56Z3FldXZmYmhzYnVwdWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI4MTAzODAsImV4cCI6MjA1ODM4NjM4MH0.OCNQQ53wO_za2oJTKPl5TYWZWIhnSnZx4qE-t42cZV4";

// Crear cliente solo si las credenciales están disponibles
const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Datos de ejemplo para fallback si no hay conexión a Supabase
const FALLBACK_MENTORS = [
  {
    id: 1,
    name: "John Doe",
    title: "Senior Software Engineer",
    company: "Google",
    bio: "10+ años de experiencia en desarrollo web y mobile. Especializado en React y Node.js."
  },
  {
    id: 2,
    name: "Jane Smith",
    title: "Product Manager",
    company: "Microsoft",
    bio: "Experiencia liderando equipos de producto en tech. Especializada en desarrollo de producto y UX."
  },
  {
    id: 3,
    name: "Carlos Rodríguez",
    title: "Data Scientist",
    company: "Amazon",
    bio: "Especialista en machine learning y análisis de datos. 8 años de experiencia trabajando con modelos predictivos."
  },
  {
    id: 4,
    name: "María González",
    title: "UX/UI Designer",
    company: "Apple",
    bio: "Diseñadora de experiencias de usuario con enfoque en accesibilidad e inclusión. Experiencia en productos móviles y web."
  },
  {
    id: 5,
    name: "Ahmed Hassan",
    title: "CTO",
    company: "FinTech Startup",
    bio: "Emprendedor serial con 3 startups exitosas. Especializado en fintech, blockchain y sistemas de pago."
  }
];

// Función para normalizar los datos de mentores
const normalizeMentorData = (mentor) => {
  // Normalización de mentor
  
  // Intentar encontrar el nombre en varias propiedades posibles
  let name = mentor.name || mentor.nombre || mentor.full_name || mentor.fullName;
  // Si no hay nombre directo, intentar construirlo de nombres parciales
  if (!name) {
    const firstName = mentor.first_name || mentor.firstName || mentor.firstname || '';
    const lastName = mentor.last_name || mentor.lastName || mentor.lastname || '';
    name = (firstName + ' ' + lastName).trim() || 'Sin nombre';
  }
  
  // Para biometrics, puede que necesitemos acceder a una propiedad de objeto anidada
  let bio = '';
  if (typeof mentor.bio === 'string') {
    bio = mentor.bio;
  } else if (mentor.description) {
    bio = mentor.description;
  } else if (mentor.about) {
    bio = mentor.about;
  } else if (mentor.biografía) {
    bio = mentor.biografía;
  } else if (mentor.biometrics && typeof mentor.biometrics === 'object') {
    // Si 'biometrics' es un objeto, podría contener la bio como propiedad
    bio = mentor.biometrics.bio || mentor.biometrics.description || '';
  } else {
    bio = 'No disponible';
  }
  
  // CAMBIO CRUCIAL: Preservar current_title como title
  const title = mentor.current_title || mentor.title || mentor.role || mentor.position || mentor.cargo || mentor.puesto || 'No especificado';
  
  return {
    id: mentor.id || mentor.mentor_id || mentor.userId || Date.now() + Math.random(),
    name: name,
    title: title, // Ahora usamos la variable que extrae primero current_title
    company: mentor.company || mentor.organization || mentor.empresa || mentor.organizacion || 'No especificada',
    bio: bio,
    // Preservar current_title para que el servidor también lo tenga disponible
    current_title: mentor.current_title
  };
};

// Helper to format name: Firstname + first letter of last name
const formatName = (fullName = '') => {
  const parts = fullName.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0];
  const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${lastInitial ? ' ' + lastInitial : ''}`;
};

function App() {
  const [menteeInfo, setMenteeInfo] = useState({
    name: '',
    lookingFor: ''
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [mentors, setMentors] = useState([]);
  const [supabaseStatus, setSupabaseStatus] = useState('Verificando...');
  // eslint-disable-next-line no-unused-vars
  const [availableMentors, setAvailableMentors] = useState([]);
  const MENTORS_PER_PAGE = 15;
  const [progress, setProgress] = useState({ 
    current: 0, 
    total: 0,
    processed: 0
  });
  const [isSearching, setIsSearching] = useState(false);
  const [abortController, setAbortController] = useState(null);
  // Usamos un modelo fijo de OpenAI
  const selectedModel = 'gpt-3.5-turbo';
  const [confettiFired, setConfettiFired] = useState(false);

  // Verificar conexión a Supabase al cargar
  useEffect(() => {
    async function checkSupabase() {
      if (!supabase) {
        setSupabaseStatus('No configurado - usando datos de ejemplo');
        return;
      }
      
      try {
        setSupabaseStatus('Conectando...');
        const { data: supabaseMentors, error: fetchError } = await supabase
          .from('mentors')
          .select('id, first_name, last_name, description, is_available');
        
        if (fetchError) {
          // console error optional
          setSupabaseStatus(`Error: ${fetchError.message} - usando datos de ejemplo`);
        } else {
          setSupabaseStatus(`Conectado ✅ (${supabaseMentors.length} mentores disponibles)`);
        }
      } catch (err) {
        // console error optional
        setSupabaseStatus(`Error de conexión: ${err.message} - usando datos de ejemplo`);
      }
    }
    
    checkSupabase();
  }, []);

  const processMentorsOnce = async (allMentors, signal, model) => {
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002';
      const response = await fetch(`${API_URL}/api/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mentee: menteeInfo,
          mentors: [],
          model
        }),
        signal
      });

      if (!response.ok) throw new Error(response.statusText);

      const data = await response.json();
      setResults(data.matches.sort((a, b) => b.score - a.score));

      return data.matches;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setIsSearching(true);
    setError(null);
    setResults([]);
    setProgress({ 
      current: 0, 
      total: 0,
      processed: 0
    });

    // Crear un nuevo AbortController para esta búsqueda
    const controller = new AbortController();
    setAbortController(controller);

    try {
      let allMentors = [];
      
      if (!supabase) {
        console.log("Usando mentores de ejemplo");
        allMentors = FALLBACK_MENTORS;
      } else {
        // Obtener mentores de Supabase
        const { data: supabaseMentors, error: fetchError } = await supabase
          .from('mentors')
          .select('id, first_name, last_name, description, is_available');
        
        if (fetchError) {
          throw new Error('Error cargando mentores: ' + fetchError.message);
        }
        
        if (!supabaseMentors || supabaseMentors.length === 0) {
          setError('No se encontraron mentores en la base de datos');
          setLoading(false);
          setIsSearching(false);
          return;
        }
        
        // Eliminar cualquier email u otra información sensible
        allMentors = supabaseMentors.map(({ email, ...rest }) => rest);
      }
      
      // Pasar el signal del AbortController a la petición
      await processMentorsOnce(allMentors, controller.signal, selectedModel);
      
      setLoading(false);
      setIsSearching(false);
    } catch (err) {
      // Verificar si el error fue por cancelación
      if (err.name === 'AbortError') {
        console.log('Search canceled by user');
        setError('Search canceled');
      } else {
        // console error optional
        setError('Error: ' + err.message);
      }
      setLoading(false);
      setIsSearching(false);
    }
  };

  // Función para cancelar la búsqueda
  const handleCancelSearch = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  useEffect(() => {
    if (results.length > 0 && !confettiFired) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
      setConfettiFired(true);
    }
    if (results.length === 0) {
      setConfettiFired(false);
    }
  }, [results, confettiFired]);

  return (
    <>
      <header className="navbar">
        <img src="/logo.svg" alt="Mentoring Matcher logo" className="navbar-logo" />
      </header>
      <div className="App">
        <main>
          <div className="mentor-search-form">
            <h1>Find your ideal mentor</h1>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Your name:</label>
                <input
                  id="name"
                  type="text"
                  value={menteeInfo.name}
                  onChange={(e) => setMenteeInfo({...menteeInfo, name: e.target.value})}
                  placeholder="Enter your name"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="lookingFor">What are you looking to get from the mentoring program?</label>
                <textarea
                  id="lookingFor"
                  value={menteeInfo.lookingFor}
                  onChange={(e) => setMenteeInfo({...menteeInfo, lookingFor: e.target.value})}
                  placeholder="e.g. I want to improve my communication skills, I want to become a CTO"
                  rows={4}
                />
              </div>
              
              <button type="submit" className="search-button" disabled={loading}>
                {loading ? 'Searching mentors...' : 'Find mentors'}
              </button>
            </form>
            
            {error && <div className="error">{error}</div>}
          </div>
          
          {loading && (
            <div className="loading-overlay">
              <div className="loader" />
              <span className="loading-text">Searching mentors...</span>
              <button className="cancel-button" onClick={handleCancelSearch}>Stop search</button>
            </div>
          )}
          
          {results.length > 0 && (
            <div className="results-container">
              <h2>Your best matches ({results.length})</h2>
              <div className="results">
                {results.map((match, index) => (
                  <div key={index} className="match-card">
                    <div className="mentor-header">
                      <h3>{formatName(match.mentor.name)}</h3>
                      {match.mentor.is_available !== undefined && !match.mentor.is_available && (
                        <span className="availability-tag">Not available</span>
                      )}
                    </div>
                    
                    {/* Bio */}
                    <div className="mentor-bio">
                      <p>{match.mentor.bio}</p>
                    </div>
                    
                    {/* Enlace al perfil del mentor - botón primario */}
                    {match.mentor.id && (
                      <div className="mentor-actions">
                        <a
                          href={`https://app.novatalent.com/mentoring/mentor/${match.mentor.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="primary-button"
                        >
                          View mentor profile
                        </a>

                        <button
                          className="copy-link"
                          onClick={() => navigator.clipboard.writeText(`https://app.novatalent.com/mentoring/mentor/${match.mentor.id}`)}
                        >
                          Copy Nova URL
                        </button>
                      </div>
                    )}

                    <div className="match-score">Match: {match.score}%</div>
                    {match.mentor.title && match.mentor.title !== 'No especificado' && (
                      <p className="mentor-title">{match.mentor.title}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default App;